package com.bridgit.api.common.security;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bridgit.api.ApiIntegrationTestSupport;
import com.bridgit.api.auth.UserSessionService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

class SessionFilterIntegrationTest extends ApiIntegrationTestSupport {

  @MockitoSpyBean
  private UserSessionService userSessionService;

  @Test
  void databaseFailureWhileCheckingTheSessionIsAServerError() throws Exception {
    String token = registerUser("filtro-db", "12345678", UUID.randomUUID())
        .path("data").path("accessToken").asText();
    doThrow(new DataAccessResourceFailureException("banco fora do ar"))
        .when(userSessionService).requireActiveSession(any(), any());

    mockMvc.perform(get("/api/auth/sessions").header("Authorization", "Bearer " + token))
        .andExpect(status().isInternalServerError())
        .andExpect(content().contentTypeCompatibleWith("application/json"))
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.error.code").value("ERRO_INTERNO"));
  }

  @Test
  void sessionErrorsUseTheSameEnvelopeAsTheHandler() throws Exception {
    String token = registerUser("filtro-401", "12345678", UUID.randomUUID())
        .path("data").path("accessToken").asText();
    mockMvc.perform(post("/api/auth/logout").header("Authorization", "Bearer " + token))
        .andExpect(status().isOk());

    mockMvc.perform(post("/api/auth/refresh").header("Authorization", "Bearer " + token))
        .andExpect(status().isUnauthorized())
        .andExpect(content().encoding("UTF-8"))
        .andExpect(jsonPath("$.error.code").value("SESSAO_REVOGADA"))
        .andExpect(jsonPath("$.error.path").value("/api/auth/refresh"))
        .andExpect(jsonPath("$.error.timestamp").isString());
  }
}
