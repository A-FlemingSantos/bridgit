package com.bridgit.api.integrations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bridgit.api.ApiIntegrationTestSupport;
import com.bridgit.api.providers.CloudProvider;
import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.web.util.UriUtils;

class ProviderApiIntegrationTest extends ApiIntegrationTestSupport {

  @Autowired
  private ProviderOAuthStateRepository oauthStateRepository;

  @Autowired
  private ProviderConnectionRepository connectionRepository;

  @Autowired
  private IntegrationTokenCipher tokenCipher;

  @Autowired
  private ProviderConnectionService providerConnectionService;

  @MockitoBean
  private ProviderOAuthClients providerOAuthClients;

  @MockitoBean
  private MicrosoftOAuthClient microsoftOAuthClient;

  private String accessToken;
  private UUID userId;

  @BeforeEach
  void setUp() throws Exception {
    UUID deviceKey = UUID.randomUUID();
    JsonNode register = registerUser("provider_user", "password123", deviceKey);
    accessToken = register.path("data").path("accessToken").asText();
    userId = UUID.fromString(register.path("data").path("user").path("id").asText());

    when(microsoftOAuthClient.provider()).thenReturn(CloudProvider.ONEDRIVE);
    when(providerOAuthClients.get(CloudProvider.ONEDRIVE)).thenReturn(microsoftOAuthClient);
  }

  @Test
  void listShowsThreeDisconnectedConfiguredProviders() throws Exception {
    mockMvc.perform(get("/api/providers")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data.length()").value(3))
        .andExpect(jsonPath("$.data[0].id").value("onedrive"))
        .andExpect(jsonPath("$.data[1].id").value("google-drive"))
        .andExpect(jsonPath("$.data[2].id").value("dropbox"))
        .andExpect(jsonPath("$.data[0].configured").value(true))
        .andExpect(jsonPath("$.data[0].connected").value(false));
  }

  @Test
  void connectReturnsAuthorizationUrlWithPkce() throws Exception {
    when(microsoftOAuthClient.authorizationUrl(anyString(), anyString()))
        .thenAnswer(invocation -> "https://login.example/authorize?state="
            + invocation.getArgument(0)
            + "&code_challenge="
            + invocation.getArgument(1));

    mockMvc.perform(post("/api/providers/onedrive/connect")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.authorizationUrl").value(Matchers.containsString("state=")))
        .andExpect(jsonPath("$.data.authorizationUrl").value(Matchers.containsString("code_challenge=")));
  }

  @Test
  void connectWithoutJwtReturns401() throws Exception {
    mockMvc.perform(post("/api/providers/onedrive/connect"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void connectWithRedirectToEchoesItAsBackgroundOnCallback() throws Exception {
    String stateToken = startAuthorizationWithBody("{\"redirectTo\":\"/providers/onedrive\"}");
    stubSuccessfulExchange(stateToken, "auth-code");

    mockMvc.perform(get("/api/providers/onedrive/callback")
            .param("state", stateToken)
            .param("code", "auth-code"))
        .andExpect(status().isFound())
        .andExpect(header().string("Location", Matchers.containsString("status=connected")))
        .andExpect(header().string("Location", Matchers.containsString("background=%2Fproviders%2Fonedrive")));
  }

  @Test
  void connectWithUnsafeRedirectToOmitsBackground() throws Exception {
    String stateToken = startAuthorizationWithBody("{\"redirectTo\":\"https://evil.test/phish\"}");
    stubSuccessfulExchange(stateToken, "auth-code");

    mockMvc.perform(get("/api/providers/onedrive/callback")
            .param("state", stateToken)
            .param("code", "auth-code"))
        .andExpect(status().isFound())
        .andExpect(header().string("Location", Matchers.containsString("status=connected")))
        .andExpect(header().string("Location", Matchers.not(Matchers.containsString("background"))));
  }

  @Test
  void expiredStateRedirectKeepsBackground() throws Exception {
    String stateToken = startAuthorizationWithBody("{\"redirectTo\":\"/home\"}");

    ProviderOAuthStateEntity state = oauthStateRepository.findByStateToken(stateToken).orElseThrow();
    state.setExpiresAt(java.time.OffsetDateTime.now().minusMinutes(1));
    oauthStateRepository.save(state);

    mockMvc.perform(get("/api/providers/onedrive/callback")
            .param("state", stateToken)
            .param("code", "auth-code"))
        .andExpect(status().isFound())
        .andExpect(header().string("Location", Matchers.containsString("error=OAUTH_STATE_EXPIRADO")))
        .andExpect(header().string("Location", Matchers.containsString("background=%2Fhome")));
  }

  @Test
  void connectWithComplexRedirectToRoundTripsFullyEncoded() throws Exception {
    String redirectTo = "/providers/onedrive/folder/x?view=grid&sort=name";
    String stateToken = startAuthorizationWithBody("{\"redirectTo\":\"" + redirectTo + "\"}");
    stubSuccessfulExchange(stateToken, "auth-code");

    MvcResult result = mockMvc.perform(get("/api/providers/onedrive/callback")
            .param("state", stateToken)
            .param("code", "auth-code"))
        .andExpect(status().isFound())
        .andExpect(header().string("Location", Matchers.containsString("status=connected")))
        .andExpect(header().string("Location", Matchers.containsString(
            "background=%2Fproviders%2Fonedrive%2Ffolder%2Fx%3Fview%3Dgrid%26sort%3Dname")))
        .andReturn();

    String location = result.getResponse().getHeader("Location");
    String encoded = UriComponentsBuilder.fromUriString(location).build()
        .getQueryParams().getFirst("background");
    String decoded = UriUtils.decode(encoded, StandardCharsets.UTF_8);
    assertThat(decoded).isEqualTo(redirectTo);
  }

  private String startAuthorizationWithBody(String jsonBody) throws Exception {
    when(microsoftOAuthClient.authorizationUrl(anyString(), anyString()))
        .thenAnswer(invocation -> "https://login.example/authorize?state=" + invocation.getArgument(0));

    MvcResult result = mockMvc.perform(post("/api/providers/onedrive/connect")
            .header("Authorization", "Bearer " + accessToken)
            .contentType(MediaType.APPLICATION_JSON)
            .content(jsonBody))
        .andExpect(status().isOk())
        .andReturn();

    String authorizationUrl = objectMapper.readTree(result.getResponse().getContentAsString())
        .path("data").path("authorizationUrl").asText();
    return UriComponentsBuilder.fromUriString(authorizationUrl).build().getQueryParams().getFirst("state");
  }

  private void stubSuccessfulExchange(String stateToken, String code) {
    ProviderOAuthStateEntity state = oauthStateRepository.findByStateToken(stateToken).orElseThrow();
    when(microsoftOAuthClient.exchangeCode(code, state.getCodeVerifier()))
        .thenReturn(new TokenResult("access-token", "refresh-token", 3600, "scope"));
    when(microsoftOAuthClient.fetchAccount("access-token"))
        .thenReturn(new ProviderAccount("account-1", "user@example.com", "Test User"));
  }

  @Test
  void callbackWithValidStateRedirectsConnected() throws Exception {
    String stateToken = "test-state-token-valid";
    ProviderOAuthStateEntity state = new ProviderOAuthStateEntity();
    state.setUserId(userId);
    state.setProvider(CloudProvider.ONEDRIVE.id());
    state.setStateToken(stateToken);
    state.setCodeVerifier("verifier-123");
    state.setExpiresAt(java.time.OffsetDateTime.now().plusMinutes(10));
    oauthStateRepository.save(state);

    when(microsoftOAuthClient.exchangeCode("auth-code", "verifier-123"))
        .thenReturn(new TokenResult("access-token", "refresh-token", 3600, "scope"));
    when(microsoftOAuthClient.fetchAccount("access-token"))
        .thenReturn(new ProviderAccount("account-1", "user@example.com", "Test User"));

    mockMvc.perform(get("/api/providers/onedrive/callback")
            .param("state", stateToken)
            .param("code", "auth-code"))
        .andExpect(status().isFound())
        .andExpect(header().string("Location", Matchers.containsString("/settings/providers?")))
        .andExpect(header().string("Location", Matchers.containsString("provider=onedrive")))
        .andExpect(header().string("Location", Matchers.containsString("status=connected")));

    mockMvc.perform(get("/api/providers")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[0].connected").value(true))
        .andExpect(jsonPath("$.data[0].account.email").value("user@example.com"));
  }

  @Test
  void callbackWorksWithoutAuthorizationHeader() throws Exception {
    String stateToken = "public-callback-state";
    ProviderOAuthStateEntity state = new ProviderOAuthStateEntity();
    state.setUserId(userId);
    state.setProvider(CloudProvider.ONEDRIVE.id());
    state.setStateToken(stateToken);
    state.setCodeVerifier("verifier-public");
    state.setExpiresAt(java.time.OffsetDateTime.now().plusMinutes(10));
    oauthStateRepository.save(state);

    when(microsoftOAuthClient.exchangeCode("code-public", "verifier-public"))
        .thenReturn(new TokenResult("access-token", "refresh-token", 3600, "scope"));
    when(microsoftOAuthClient.fetchAccount("access-token"))
        .thenReturn(new ProviderAccount("account-1", "user@example.com", "Test User"));

    mockMvc.perform(get("/api/providers/onedrive/callback")
            .param("state", stateToken)
            .param("code", "code-public"))
        .andExpect(status().isFound())
        .andExpect(header().string("Location", Matchers.containsString("status=connected")));
  }

  @Test
  void reusedStateReturnsExpiredError() throws Exception {
    String stateToken = "reused-state-token";
    ProviderOAuthStateEntity state = new ProviderOAuthStateEntity();
    state.setUserId(userId);
    state.setProvider(CloudProvider.ONEDRIVE.id());
    state.setStateToken(stateToken);
    state.setCodeVerifier("verifier-reused");
    state.setExpiresAt(java.time.OffsetDateTime.now().plusMinutes(10));
    state.setUsedAt(java.time.OffsetDateTime.now().minusMinutes(1));
    oauthStateRepository.save(state);

    mockMvc.perform(get("/api/providers/onedrive/callback")
            .param("state", stateToken)
            .param("code", "auth-code"))
        .andExpect(status().isFound())
        .andExpect(header().string("Location", Matchers.containsString("status=error")))
        .andExpect(header().string("Location", Matchers.containsString("error=OAUTH_STATE_EXPIRADO")));
  }

  @Test
  void unknownStateReturnsInvalidError() throws Exception {
    mockMvc.perform(get("/api/providers/onedrive/callback")
            .param("state", "missing-state")
            .param("code", "auth-code"))
        .andExpect(status().isFound())
        .andExpect(header().string("Location", Matchers.containsString("error=OAUTH_STATE_INVALIDO")));
  }

  @Test
  void disconnectRemovesConnection() throws Exception {
    ProviderConnectionEntity connection = new ProviderConnectionEntity();
    connection.setUserId(userId);
    connection.setProvider(CloudProvider.ONEDRIVE.id());
    connection.setAccountId("account-1");
    connection.setEncryptedRefreshToken(tokenCipher.encrypt("refresh-token"));
    connection.setConnectedAt(java.time.OffsetDateTime.now());
    connectionRepository.save(connection);

    mockMvc.perform(delete("/api/providers/onedrive")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[0].connected").value(false));

    assertThat(connectionRepository.findByUserIdAndProvider(userId, CloudProvider.ONEDRIVE.id())).isEmpty();
  }

  @Test
  void accessTokenRefreshInvalidGrantSetsReconnectionRequired() {
    ProviderConnectionEntity connection = new ProviderConnectionEntity();
    connection.setUserId(userId);
    connection.setProvider(CloudProvider.ONEDRIVE.id());
    connection.setAccountId("account-1");
    connection.setEncryptedRefreshToken(tokenCipher.encrypt("refresh-token"));
    connection.setConnectedAt(java.time.OffsetDateTime.now());
    ProviderConnectionEntity saved = connectionRepository.save(connection);

    when(microsoftOAuthClient.refresh("refresh-token"))
        .thenThrow(new ReconnectionRequiredException());

    assertThatThrownBy(() -> providerConnectionService.accessToken(saved))
        .isInstanceOf(ReconnectionRequiredException.class);

    ProviderConnectionEntity updated = connectionRepository.findById(saved.getId()).orElseThrow();
    assertThat(updated.getLastError()).isEqualTo("RECONEXAO_NECESSARIA");
  }

}
