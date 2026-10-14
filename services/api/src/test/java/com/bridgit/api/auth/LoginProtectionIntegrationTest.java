package com.bridgit.api.auth;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bridgit.api.ApiIntegrationTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.ResultActions;

@TestPropertySource(properties = {
    "app.auth.login-max-failures-per-user=3",
    "app.auth.login-max-failures-per-address=5"
})
class LoginProtectionIntegrationTest extends ApiIntegrationTestSupport {

  @MockitoSpyBean
  private PasswordEncoder passwordEncoder;

  @Test
  void blocksAUsernameAfterRepeatedFailures() throws Exception {
    registerUser("brute-user", "12345678", UUID.randomUUID());

    for (int i = 0; i < 3; i++) {
      login("brute-user", "errada-" + i, "10.0.0.1").andExpect(status().isUnauthorized());
    }

    // Even the right password waits until the window passes.
    login("brute-user", "12345678", "10.0.0.2")
        .andExpect(status().isTooManyRequests())
        .andExpect(header().exists("Retry-After"))
        .andExpect(jsonPath("$.error.code").value("MUITAS_TENTATIVAS"));
  }

  @Test
  void successfulLoginClearsTheUsernameCount() throws Exception {
    registerUser("reset-user", "12345678", UUID.randomUUID());

    login("reset-user", "errada-1", "10.0.1.1").andExpect(status().isUnauthorized());
    login("reset-user", "errada-2", "10.0.1.1").andExpect(status().isUnauthorized());
    login("reset-user", "12345678", "10.0.1.1").andExpect(status().isOk());
    login("reset-user", "errada-3", "10.0.1.1").andExpect(status().isUnauthorized());
    login("reset-user", "12345678", "10.0.1.1").andExpect(status().isOk());
  }

  @Test
  void blocksAnAddressTryingManyUsernames() throws Exception {
    for (int i = 0; i < 5; i++) {
      login("ninguem-" + i, "12345678", "10.0.2.1").andExpect(status().isUnauthorized());
    }

    login("outro-nome", "12345678", "10.0.2.1")
        .andExpect(status().isTooManyRequests())
        .andExpect(jsonPath("$.error.code").value("MUITAS_TENTATIVAS"));
    login("outro-nome", "12345678", "10.0.2.2").andExpect(status().isUnauthorized());
  }

  @Test
  void unknownUserStillRunsThePasswordCheck() throws Exception {
    clearInvocations(passwordEncoder);

    login("nao-existe", "12345678", "10.0.3.1").andExpect(status().isUnauthorized());

    verify(passwordEncoder, times(1)).matches(anyString(), anyString());
  }

  private ResultActions login(String username, String password, String address) throws Exception {
    return mockMvc.perform(post("/api/auth/login")
        .with(request -> {
          request.setRemoteAddr(address);
          return request;
        })
        .contentType(MediaType.APPLICATION_JSON)
        .content("""
            {
              "username": "%s",
              "password": "%s",
              "deviceKey": "%s",
              "clientKind": "web"
            }
            """.formatted(username, password, UUID.randomUUID())));
  }
}
