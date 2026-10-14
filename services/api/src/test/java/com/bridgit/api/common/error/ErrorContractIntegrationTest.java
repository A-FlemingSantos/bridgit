package com.bridgit.api.common.error;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bridgit.api.ApiIntegrationTestSupport;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

class ErrorContractIntegrationTest extends ApiIntegrationTestSupport {

  @Test
  void missingAuthenticationUsesTheEnvelopeInUtf8() throws Exception {
    var result = mockMvc.perform(get("/api/providers"))
        .andExpect(status().isUnauthorized())
        .andExpect(content().encoding("UTF-8"))
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.error.code").value("AUTENTICACAO_OBRIGATORIA"))
        .andExpect(jsonPath("$.error.path").value("/api/providers"))
        .andExpect(jsonPath("$.error.timestamp").isString())
        .andReturn();

    String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
    assertThat(body).contains("Você precisa estar autenticado");
  }

  @Test
  void unsupportedMethodIs405() throws Exception {
    mockMvc.perform(put("/api/providers").header("Authorization", "Bearer " + token()))
        .andExpect(status().isMethodNotAllowed())
        .andExpect(jsonPath("$.error.code").value("METODO_NAO_PERMITIDO"));
  }

  @Test
  void missingParameterIs400() throws Exception {
    mockMvc.perform(get("/api/search").header("Authorization", "Bearer " + token()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("REQUISICAO_INVALIDA"))
        .andExpect(jsonPath("$.error.message").value("Falta o parâmetro 'q'."));
  }

  @Test
  void missingMultipartPartIs400() throws Exception {
    MockMultipartFile file = new MockMultipartFile("file", "a.txt", "text/plain", "conteudo".getBytes());
    mockMvc.perform(multipart("/api/operations/uploads").file(file).header("Authorization", "Bearer " + token()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("REQUISICAO_INVALIDA"));
  }

  @Test
  void unknownPathIs404() throws Exception {
    mockMvc.perform(get("/api/nao-existe").header("Authorization", "Bearer " + token()))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("RECURSO_NAO_ENCONTRADO"));
  }

  @Test
  void logoutIsIdempotent() throws Exception {
    String token = token();
    mockMvc.perform(post("/api/auth/logout").header("Authorization", "Bearer " + token))
        .andExpect(status().isOk());

    mockMvc.perform(post("/api/auth/logout").header("Authorization", "Bearer " + token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true));
    mockMvc.perform(post("/api/auth/logout").header("Authorization", "Bearer token-invalido"))
        .andExpect(status().isOk());
    mockMvc.perform(post("/api/auth/logout"))
        .andExpect(status().isOk());

    // The revoked token is still refused everywhere else.
    mockMvc.perform(post("/api/auth/refresh").header("Authorization", "Bearer " + token))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.code").value("SESSAO_REVOGADA"));
  }

  private String token() throws Exception {
    return registerUser("erros-" + UUID.randomUUID().toString().substring(0, 8), "12345678", UUID.randomUUID())
        .path("data").path("accessToken").asText();
  }
}
