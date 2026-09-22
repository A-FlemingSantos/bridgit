package com.bridgit.api;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuthApiIntegrationTest extends ApiIntegrationTestSupport {

  @Test
  void shouldRegisterAndReturnSessionPayload() throws Exception {
    UUID deviceKey = UUID.randomUUID();

    mockMvc.perform(post("/api/auth/register")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {
                  "username": "arthur",
                  "password": "12345678",
                  "deviceKey": "%s"
                }
                """.formatted(deviceKey)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data.accessToken").isNotEmpty())
        .andExpect(jsonPath("$.data.expiresAt").isNotEmpty())
        .andExpect(jsonPath("$.data.user.username").value("arthur"))
        .andExpect(jsonPath("$.data.session.persistent").value(false));
  }

  @Test
  void shouldLoginWithValidCredentials() throws Exception {
    UUID deviceKey = UUID.randomUUID();
    registerUser("login-user", "12345678", deviceKey);

    mockMvc.perform(post("/api/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {
                  "username": "login-user",
                  "password": "12345678",
                  "deviceKey": "%s"
                }
                """.formatted(deviceKey)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.user.username").value("login-user"))
        .andExpect(jsonPath("$.data.accessToken").isNotEmpty());
  }

  @Test
  void shouldReturnSameMessageForUnknownUserAndWrongPassword() throws Exception {
    UUID deviceKey = UUID.randomUUID();
    registerUser("enum-user", "12345678", deviceKey);

    mockMvc.perform(post("/api/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {
                  "username": "missing-user",
                  "password": "12345678",
                  "deviceKey": "%s"
                }
                """.formatted(deviceKey)))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.message").value("Usuario ou senha invalidos."));

    mockMvc.perform(post("/api/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {
                  "username": "enum-user",
                  "password": "87654321",
                  "deviceKey": "%s"
                }
                """.formatted(deviceKey)))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.message").value("Usuario ou senha invalidos."));
  }

  @Test
  void shouldRefreshCurrentSession() throws Exception {
    UUID deviceKey = UUID.randomUUID();
    JsonNode register = registerUser("refresh-user", "12345678", deviceKey);
    String token = register.path("data").path("accessToken").asText();

    mockMvc.perform(post("/api/auth/refresh")
            .header("Authorization", "Bearer " + token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.user.username").value("refresh-user"))
        .andExpect(jsonPath("$.data.accessToken").isNotEmpty());
  }

  @Test
  void shouldLogoutAndRejectOldToken() throws Exception {
    UUID deviceKey = UUID.randomUUID();
    JsonNode register = registerUser("logout-user", "12345678", deviceKey);
    String token = register.path("data").path("accessToken").asText();

    mockMvc.perform(post("/api/auth/logout")
            .header("Authorization", "Bearer " + token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.message").value("Sessao encerrada com sucesso."));

    mockMvc.perform(post("/api/auth/refresh")
            .header("Authorization", "Bearer " + token))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.code").value("SESSAO_REVOGADA"));
  }

  @Test
  void shouldRevokePreviousTokenWhenLoggingInWithSameDeviceKey() throws Exception {
    UUID deviceKey = UUID.randomUUID();
    JsonNode firstLogin = registerUser("device-user", "12345678", deviceKey);
    String firstToken = firstLogin.path("data").path("accessToken").asText();

    JsonNode secondLogin = loginUser("device-user", "12345678", deviceKey);
    String secondToken = secondLogin.path("data").path("accessToken").asText();

    mockMvc.perform(post("/api/auth/refresh")
            .header("Authorization", "Bearer " + firstToken))
        .andExpect(status().isUnauthorized());

    mockMvc.perform(post("/api/auth/refresh")
            .header("Authorization", "Bearer " + secondToken))
        .andExpect(status().isOk());
  }

  @Test
  void shouldKeepOtherDeviceSessionsActive() throws Exception {
    UUID firstDevice = UUID.randomUUID();
    UUID secondDevice = UUID.randomUUID();

    JsonNode firstLogin = registerUser("multi-device", "12345678", firstDevice);
    String firstToken = firstLogin.path("data").path("accessToken").asText();

    loginUser("multi-device", "12345678", secondDevice);

    mockMvc.perform(post("/api/auth/refresh")
            .header("Authorization", "Bearer " + firstToken))
        .andExpect(status().isOk());
  }

  @Test
  void shouldRevokeOtherDeviceWhenPasswordChanges() throws Exception {
    UUID firstDevice = UUID.randomUUID();
    UUID secondDevice = UUID.randomUUID();

    JsonNode firstLogin = registerUser("password-user", "12345678", firstDevice);
    String firstToken = firstLogin.path("data").path("accessToken").asText();

    JsonNode secondLogin = loginUser("password-user", "12345678", secondDevice);
    String secondToken = secondLogin.path("data").path("accessToken").asText();

    mockMvc.perform(post("/api/account/password")
            .header("Authorization", "Bearer " + firstToken)
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {
                  "currentPassword": "12345678",
                  "newPassword": "87654321"
                }
                """))
        .andExpect(status().isOk());

    mockMvc.perform(post("/api/auth/refresh")
            .header("Authorization", "Bearer " + secondToken))
        .andExpect(status().isUnauthorized());

    mockMvc.perform(post("/api/auth/refresh")
            .header("Authorization", "Bearer " + firstToken))
        .andExpect(status().isOk());
  }

  @Test
  void shouldRejectTokenAfterAccountDeletion() throws Exception {
    UUID deviceKey = UUID.randomUUID();
    JsonNode register = registerUser("delete-user", "12345678", deviceKey);
    String token = register.path("data").path("accessToken").asText();

    mockMvc.perform(delete("/api/account")
            .header("Authorization", "Bearer " + token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.message").value("Conta removida com sucesso."));

    mockMvc.perform(get("/api/account")
            .header("Authorization", "Bearer " + token))
        .andExpect(status().isUnauthorized());
  }
}
