package com.bridgit.api.integrations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bridgit.api.ApiIntegrationTestSupport;
import com.bridgit.api.providers.CloudProvider;
import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.client.RestClient;
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
  private CloudProvidersProperties cloudProvidersProperties;

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

  @Test
  void invalidGrantThroughRealHttpPersistsReconnectionAndAnswers409() throws Exception {
    ProviderConnectionEntity connection = new ProviderConnectionEntity();
    connection.setUserId(userId);
    connection.setProvider(CloudProvider.ONEDRIVE.id());
    connection.setAccountId("account-1");
    connection.setEncryptedRefreshToken(tokenCipher.encrypt("refresh-token"));
    connection.setConnectedAt(java.time.OffsetDateTime.now());
    ProviderConnectionEntity saved = connectionRepository.save(connection);

    RestClient.Builder tokenBuilder = RestClient.builder();
    MockRestServiceServer tokenServer = MockRestServiceServer.bindTo(tokenBuilder).build();
    MicrosoftOAuthClient realClient = new MicrosoftOAuthClient(
        cloudProvidersProperties, tokenBuilder, objectMapper);
    when(providerOAuthClients.get(CloudProvider.ONEDRIVE)).thenReturn(realClient);
    tokenServer.expect(org.springframework.test.web.client.match.MockRestRequestMatchers
            .requestTo("https://login.microsoftonline.com/common/oauth2/v2.0/token"))
        .andRespond(org.springframework.test.web.client.response.MockRestResponseCreators
            .withStatus(HttpStatus.BAD_REQUEST)
            .contentType(MediaType.APPLICATION_JSON)
            .body("{\"error\":\"invalid_grant\"}"));

    mockMvc.perform(put("/api/providers/onedrive/items/some-ref/public-link")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("RECONEXAO_NECESSARIA"));

    assertThat(connectionRepository.findById(saved.getId()).orElseThrow().getLastError())
        .isEqualTo("RECONEXAO_NECESSARIA");

    mockMvc.perform(get("/api/providers")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[0].lastError").value("RECONEXAO_NECESSARIA"));

    tokenServer.verify();
  }

  @Test
  void concurrentAccessTokensTriggerSingleRefresh() throws Exception {
    ProviderConnectionEntity saved = seedConnection();
    CountDownLatch entered = new CountDownLatch(1);
    CountDownLatch release = new CountDownLatch(1);
    AtomicInteger calls = new AtomicInteger();
    when(microsoftOAuthClient.refresh(anyString())).thenAnswer(invocation -> {
      calls.incrementAndGet();
      entered.countDown();
      assertThat(release.await(15, TimeUnit.SECONDS)).isTrue();
      return new TokenResult("shared-access", null, 3600, "scope");
    });

    ExecutorService pool = Executors.newFixedThreadPool(8);
    try {
      List<Future<String>> futures = new ArrayList<>();
      for (int i = 0; i < 8; i++) {
        futures.add(pool.submit(() -> providerConnectionService.accessToken(saved)));
      }
      assertThat(entered.await(15, TimeUnit.SECONDS)).isTrue();
      release.countDown();
      for (Future<String> future : futures) {
        assertThat(future.get(15, TimeUnit.SECONDS)).isEqualTo("shared-access");
      }
    } finally {
      pool.shutdownNow();
    }
    assertThat(calls.get()).isEqualTo(1);
  }

  @Test
  void disconnectDuringRefreshCachesNothing() throws Exception {
    ProviderConnectionEntity saved = seedConnection();
    CountDownLatch entered = new CountDownLatch(1);
    CountDownLatch release = new CountDownLatch(1);
    AtomicInteger calls = new AtomicInteger();
    when(microsoftOAuthClient.refresh(anyString())).thenAnswer(invocation -> {
      calls.incrementAndGet();
      entered.countDown();
      assertThat(release.await(15, TimeUnit.SECONDS)).isTrue();
      return new TokenResult("stale-access", "rotated", 3600, "scope");
    });

    ExecutorService pool = Executors.newSingleThreadExecutor();
    Future<String> inFlight = pool.submit(() -> providerConnectionService.accessToken(saved));
    try {
      assertThat(entered.await(15, TimeUnit.SECONDS)).isTrue();
      connectionRepository.deleteById(saved.getId());
      providerConnectionService.invalidate(saved.getId());
      release.countDown();
      assertThatThrownBy(() -> inFlight.get(15, TimeUnit.SECONDS))
          .hasCauseInstanceOf(ReconnectionRequiredException.class);
    } finally {
      pool.shutdownNow();
    }

    assertThat(connectionRepository.findById(saved.getId())).isEmpty();
    assertThatThrownBy(() -> providerConnectionService.accessToken(saved))
        .isInstanceOf(ReconnectionRequiredException.class);
    assertThat(calls.get()).isEqualTo(2);
  }

  @Test
  void reconnectDuringRefreshDiscardsStaleResult() throws Exception {
    ProviderConnectionEntity saved = seedConnection();
    CountDownLatch entered = new CountDownLatch(1);
    CountDownLatch release = new CountDownLatch(1);
    AtomicInteger calls = new AtomicInteger();
    when(microsoftOAuthClient.refresh(anyString())).thenAnswer(invocation -> {
      calls.incrementAndGet();
      entered.countDown();
      assertThat(release.await(15, TimeUnit.SECONDS)).isTrue();
      String used = invocation.getArgument(0);
      if ("brand-new-refresh".equals(used)) {
        return new TokenResult("fresh-access", null, 3600, "scope");
      }
      return new TokenResult("stale-access", "stale-rotated", 3600, "scope");
    });

    ExecutorService pool = Executors.newSingleThreadExecutor();
    Future<String> inFlight = pool.submit(() -> providerConnectionService.accessToken(saved));
    try {
      assertThat(entered.await(15, TimeUnit.SECONDS)).isTrue();
      ProviderConnectionEntity current = connectionRepository.findById(saved.getId()).orElseThrow();
      current.setEncryptedRefreshToken(tokenCipher.encrypt("brand-new-refresh"));
      current.setConnectedAt(OffsetDateTime.now().plusMinutes(1));
      connectionRepository.save(current);
      providerConnectionService.invalidate(saved.getId());
      release.countDown();
      assertThat(inFlight.get(15, TimeUnit.SECONDS)).isEqualTo("fresh-access");
    } finally {
      pool.shutdownNow();
    }

    assertThat(tokenCipher.decrypt(
        connectionRepository.findById(saved.getId()).orElseThrow().getEncryptedRefreshToken()))
        .isEqualTo("brand-new-refresh");
    assertThat(calls.get()).isEqualTo(2);
  }

  @Test
  void cacheEvictionDuringRefreshKeepsTheRefreshedToken() throws Exception {
    ProviderConnectionEntity saved = seedConnection();
    CountDownLatch entered = new CountDownLatch(1);
    CountDownLatch release = new CountDownLatch(1);
    AtomicInteger calls = new AtomicInteger();
    when(microsoftOAuthClient.refresh(anyString())).thenAnswer(invocation -> {
      calls.incrementAndGet();
      entered.countDown();
      assertThat(release.await(15, TimeUnit.SECONDS)).isTrue();
      return new TokenResult("refreshed-access", null, 3600, "scope");
    });

    ExecutorService pool = Executors.newSingleThreadExecutor();
    Future<String> inFlight = pool.submit(() -> providerConnectionService.accessToken(saved));
    try {
      assertThat(entered.await(15, TimeUnit.SECONDS)).isTrue();
      providerConnectionService.evict(saved.getId());
      release.countDown();
      assertThat(inFlight.get(15, TimeUnit.SECONDS)).isEqualTo("refreshed-access");
    } finally {
      pool.shutdownNow();
    }

    assertThat(connectionRepository.findById(saved.getId()).orElseThrow().getLastError()).isNull();
    assertThat(calls.get()).isEqualTo(1);
  }

  private ProviderConnectionEntity seedConnection() {
    ProviderConnectionEntity connection = new ProviderConnectionEntity();
    connection.setUserId(userId);
    connection.setProvider(CloudProvider.ONEDRIVE.id());
    connection.setAccountId("account-1");
    connection.setEncryptedRefreshToken(tokenCipher.encrypt("refresh-token"));
    connection.setConnectedAt(java.time.OffsetDateTime.now());
    return connectionRepository.save(connection);
  }

}
