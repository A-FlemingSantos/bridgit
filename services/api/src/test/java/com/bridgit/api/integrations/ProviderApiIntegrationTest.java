package com.bridgit.api.integrations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
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
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
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
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.web.util.UriUtils;

class ProviderApiIntegrationTest extends ApiIntegrationTestSupport {

  @TestConfiguration
  static class FindByIdHookConfig {
    static final AtomicBoolean hookArmed = new AtomicBoolean(false);

    @Bean
    @Primary
    ProviderConnectionRepository hookingConnectionRepository(
        @Qualifier("providerConnectionRepository") ProviderConnectionRepository real,
        ApplicationContext context) {
      return (ProviderConnectionRepository) Proxy.newProxyInstance(
          FindByIdHookConfig.class.getClassLoader(),
          new Class<?>[] { ProviderConnectionRepository.class },
          (proxy, method, args) -> {
            Object result;
            try {
              result = method.invoke(real, args);
            } catch (InvocationTargetException ex) {
              throw ex.getCause();
            }
            if (method.getName().equals("findById") && hookArmed.compareAndSet(true, false)) {
              context.getBean(ProviderConnectionService.class).invalidate((UUID) args[0]);
            }
            return result;
          });
    }
  }

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
  private int connectionSequence;

  @BeforeEach
  void setUp() throws Exception {
    FindByIdHookConfig.hookArmed.set(false);
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
        .andExpect(jsonPath("$.data[0].connected").value(false))
        .andExpect(jsonPath("$.data[0].connections.length()").value(0))
        .andExpect(jsonPath("$.data[1].connections.length()").value(0))
        .andExpect(jsonPath("$.data[2].connections.length()").value(0));
  }

  @Test
  void connectReturnsAuthorizationUrlWithPkce() throws Exception {
    when(microsoftOAuthClient.authorizationUrl(anyString(), anyString(), anyBoolean()))
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
  void connectWithMobileRedirectReturnsToTheApp() throws Exception {
    String stateToken = startAuthorizationWithBody("{\"redirectTo\":\"bridgit://oauth\"}");
    stubSuccessfulExchange(stateToken, "auth-code");

    mockMvc.perform(get("/api/providers/onedrive/callback")
            .param("state", stateToken)
            .param("code", "auth-code"))
        .andExpect(status().isFound())
        .andExpect(header().string("Location", Matchers.startsWith("bridgit://oauth?")))
        .andExpect(header().string("Location", Matchers.containsString("provider=onedrive")))
        .andExpect(header().string("Location", Matchers.containsString("status=connected")))
        .andExpect(header().string("Location", Matchers.not(Matchers.containsString("code="))))
        .andExpect(header().string("Location", Matchers.not(Matchers.containsString("localhost:5173"))));
  }

  @Test
  void connectWithMobileRedirectReportsErrorsToTheApp() throws Exception {
    String stateToken = startAuthorizationWithBody("{\"redirectTo\":\"bridgit://oauth\"}");

    mockMvc.perform(get("/api/providers/onedrive/callback")
            .param("state", stateToken)
            .param("error", "access_denied"))
        .andExpect(status().isFound())
        .andExpect(header().string("Location", Matchers.startsWith("bridgit://oauth?")))
        .andExpect(header().string("Location", Matchers.containsString("status=error")))
        .andExpect(header().string("Location", Matchers.containsString("error=PROVEDOR_RECUSOU")));
  }

  @Test
  void connectWithUnlistedAppSchemeFallsBackToTheWebFlow() throws Exception {
    String stateToken = startAuthorizationWithBody("{\"redirectTo\":\"evilapp://steal\"}");
    stubSuccessfulExchange(stateToken, "auth-code");

    mockMvc.perform(get("/api/providers/onedrive/callback")
            .param("state", stateToken)
            .param("code", "auth-code"))
        .andExpect(status().isFound())
        .andExpect(header().string("Location", Matchers.startsWith("http://localhost:5173/settings/providers")))
        .andExpect(header().string("Location", Matchers.not(Matchers.containsString("evilapp"))));
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
    when(microsoftOAuthClient.authorizationUrl(anyString(), anyString(), anyBoolean()))
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

  private ProviderOAuthStateEntity saveState(String token, String verifier, boolean allowAccountChange) {
    ProviderOAuthStateEntity state = new ProviderOAuthStateEntity();
    state.setUserId(userId);
    state.setProvider(CloudProvider.ONEDRIVE.id());
    state.setStateToken(token);
    state.setCodeVerifier(verifier);
    state.setAllowAccountChange(allowAccountChange);
    state.setExpiresAt(java.time.OffsetDateTime.now().plusMinutes(10));
    return oauthStateRepository.save(state);
  }

  private ProviderConnectionEntity saveConnection(String accountId) {
    ProviderConnectionEntity connection = new ProviderConnectionEntity();
    connection.setUserId(userId);
    connection.setProvider(CloudProvider.ONEDRIVE.id());
    connection.setAccountId(accountId);
    connection.setAccountEmail(accountId + "@example.com");
    connection.setEncryptedRefreshToken(tokenCipher.encrypt("old-refresh-token"));
    connection.setConnectedAt(java.time.OffsetDateTime.now());
    // Each call is one second newer than the last, so "oldest first" is deterministic.
    connection.setCreatedAt(java.time.OffsetDateTime.now().minusHours(1).plusSeconds(connectionSequence++));
    return connectionRepository.save(connection);
  }

  private void stubExchangeForAccount(String code, String verifier, String accountId) {
    when(microsoftOAuthClient.exchangeCode(code, verifier))
        .thenReturn(new TokenResult("access-" + accountId, "refresh-" + accountId, 3600, "scope"));
    when(microsoftOAuthClient.fetchAccount("access-" + accountId))
        .thenReturn(new ProviderAccount(accountId, accountId + "@example.com", "Test User"));
  }

  @Test
  void connectPassesAddAccountToTheClient() throws Exception {
    startAuthorizationWithBody("{\"addAccount\":true}");
    verify(microsoftOAuthClient).authorizationUrl(anyString(), anyString(), org.mockito.ArgumentMatchers.eq(true));

    startAuthorizationWithBody("{\"redirectTo\":\"/home\"}");
    verify(microsoftOAuthClient).authorizationUrl(anyString(), anyString(), org.mockito.ArgumentMatchers.eq(false));
  }

  @Test
  void connectIgnoresAllowAccountChange() throws Exception {
    String stateToken = startAuthorizationWithBody("{\"allowAccountChange\":true}");

    assertThat(oauthStateRepository.findByStateToken(stateToken).orElseThrow().isAllowAccountChange()).isFalse();
    verify(microsoftOAuthClient).authorizationUrl(anyString(), anyString(), org.mockito.ArgumentMatchers.eq(false));
  }

  @Test
  void differentAccountAddsASecondConnection() throws Exception {
    ProviderConnectionEntity old = saveConnection("account-old");
    saveState("state-different", "verifier-different", false);
    stubExchangeForAccount("code-different", "verifier-different", "account-new");

    MvcResult result = mockMvc.perform(get("/api/providers/onedrive/callback")
            .param("state", "state-different")
            .param("code", "code-different"))
        .andExpect(status().isFound())
        .andExpect(header().string("Location", Matchers.containsString("status=connected")))
        .andExpect(header().string("Location", Matchers.not(Matchers.containsString("OAUTH_CONTA_DIFERENTE"))))
        .andReturn();

    List<ProviderConnectionEntity> all = connectionRepository
        .findByUserIdAndProviderOrderByCreatedAtAscIdAsc(userId, CloudProvider.ONEDRIVE.id());
    assertThat(all).hasSize(2);
    ProviderConnectionEntity oldest = all.get(0);
    ProviderConnectionEntity added = all.get(1);
    assertThat(oldest.getId()).isEqualTo(old.getId());
    assertThat(oldest.getAccountId()).isEqualTo("account-old");
    assertThat(tokenCipher.decrypt(oldest.getEncryptedRefreshToken())).isEqualTo("old-refresh-token");
    assertThat(added.getAccountId()).isEqualTo("account-new");
    assertThat(tokenCipher.decrypt(added.getEncryptedRefreshToken())).isEqualTo("refresh-account-new");

    String location = result.getResponse().getHeader("Location");
    assertThat(UriComponentsBuilder.fromUriString(location).build().getQueryParams().getFirst("connection"))
        .isEqualTo(added.getId().toString());

    mockMvc.perform(get("/api/providers")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.length()").value(3))
        .andExpect(jsonPath("$.data[0].connected").value(true))
        .andExpect(jsonPath("$.data[0].connectionId").value(old.getId().toString()))
        .andExpect(jsonPath("$.data[0].account.email").value("account-old@example.com"))
        .andExpect(jsonPath("$.data[0].connections.length()").value(2))
        .andExpect(jsonPath("$.data[0].connections[0].connectionId").value(old.getId().toString()))
        .andExpect(jsonPath("$.data[0].connections[0].provider").value("onedrive"))
        .andExpect(jsonPath("$.data[0].connections[1].connectionId").value(added.getId().toString()))
        .andExpect(jsonPath("$.data[0].connections[1].account.email").value("account-new@example.com"))
        .andExpect(jsonPath("$.data[0].connections[1].generation").value(1))
        .andExpect(jsonPath("$.data[0].connections[1].syncState").value("scheduled"))
        .andExpect(jsonPath("$.data[1].connected").value(false))
        .andExpect(jsonPath("$.data[1].connections.length()").value(0));
  }

  @Test
  void sameAccountRefreshesInPlaceAndBumpsTheGeneration() throws Exception {
    ProviderConnectionEntity old = saveConnection("account-same");
    saveState("state-same", "verifier-same", false);
    stubExchangeForAccount("code-same", "verifier-same", "account-same");

    MvcResult result = mockMvc.perform(get("/api/providers/onedrive/callback")
            .param("state", "state-same")
            .param("code", "code-same"))
        .andExpect(status().isFound())
        .andExpect(header().string("Location", Matchers.containsString("status=connected")))
        .andExpect(header().string("Location", Matchers.containsString("connection=" + old.getId())))
        .andReturn();
    assertThat(result.getResponse().getHeader("Location")).doesNotContain("error=");

    List<ProviderConnectionEntity> all = connectionRepository
        .findByUserIdAndProviderOrderByCreatedAtAscIdAsc(userId, CloudProvider.ONEDRIVE.id());
    assertThat(all).hasSize(1);
    ProviderConnectionEntity updated = all.get(0);
    assertThat(updated.getId()).isEqualTo(old.getId());
    assertThat(updated.getGeneration()).isEqualTo(old.getGeneration() + 1);
    assertThat(tokenCipher.decrypt(updated.getEncryptedRefreshToken())).isEqualTo("refresh-account-same");
  }

  @Test
  void failedCallbackRedirectsWithoutConnection() throws Exception {
    mockMvc.perform(get("/api/providers/onedrive/callback")
            .param("state", "missing-state")
            .param("code", "auth-code"))
        .andExpect(status().isFound())
        .andExpect(header().string("Location", Matchers.not(Matchers.containsString("connection="))));
  }

  @Test
  void transientExchangeFailureReleasesTheState() throws Exception {
    saveState("state-transient", "verifier-transient", false);
    when(microsoftOAuthClient.exchangeCode("code-transient", "verifier-transient"))
        .thenThrow(new com.bridgit.api.providers.ProviderApiException(
            HttpStatus.SERVICE_UNAVAILABLE, "PROVEDOR_INDISPONIVEL", "indisponivel"))
        .thenReturn(new TokenResult("access-ok", "refresh-ok", 3600, "scope"));
    when(microsoftOAuthClient.fetchAccount("access-ok"))
        .thenReturn(new ProviderAccount("account-1", "user@example.com", "Test User"));

    mockMvc.perform(get("/api/providers/onedrive/callback")
            .param("state", "state-transient")
            .param("code", "code-transient"))
        .andExpect(status().isFound())
        .andExpect(header().string("Location", Matchers.containsString("error=OAUTH_TROCA_TEMPORARIA")));

    assertThat(oauthStateRepository.findByStateToken("state-transient").orElseThrow().getUsedAt()).isNull();

    mockMvc.perform(get("/api/providers/onedrive/callback")
            .param("state", "state-transient")
            .param("code", "code-transient"))
        .andExpect(status().isFound())
        .andExpect(header().string("Location", Matchers.containsString("status=connected")));
    assertThat(oauthStateRepository.findByStateToken("state-transient").orElseThrow().getUsedAt()).isNotNull();
  }

  @Test
  void ioFailureOnExchangeIsTransient() throws Exception {
    saveState("state-io", "verifier-io", false);
    when(microsoftOAuthClient.exchangeCode("code-io", "verifier-io"))
        .thenThrow(new org.springframework.web.client.ResourceAccessException("timeout"));

    mockMvc.perform(get("/api/providers/onedrive/callback")
            .param("state", "state-io")
            .param("code", "code-io"))
        .andExpect(header().string("Location", Matchers.containsString("error=OAUTH_TROCA_TEMPORARIA")));
    assertThat(oauthStateRepository.findByStateToken("state-io").orElseThrow().getUsedAt()).isNull();
  }

  @Test
  void missingClientReportsProviderNotConfiguredAndKeepsTheStateUsed() throws Exception {
    saveState("state-no-client", "verifier-no-client", false);
    when(providerOAuthClients.get(CloudProvider.ONEDRIVE)).thenThrow(ProviderOAuthClients.notConfigured());

    mockMvc.perform(get("/api/providers/onedrive/callback")
            .param("state", "state-no-client")
            .param("code", "code"))
        .andExpect(status().isFound())
        .andExpect(header().string("Location", Matchers.containsString("error=PROVEDOR_NAO_CONFIGURADO")));
    assertThat(oauthStateRepository.findByStateToken("state-no-client").orElseThrow().getUsedAt()).isNotNull();
  }

  @Test
  void invalidClientOnExchangeReportsProviderNotConfigured() throws Exception {
    saveState("state-invalid-client", "verifier-invalid-client", false);
    when(microsoftOAuthClient.exchangeCode("code", "verifier-invalid-client"))
        .thenThrow(new com.bridgit.api.providers.ProviderApiException(
            HttpStatus.SERVICE_UNAVAILABLE, "PROVEDOR_CONFIGURACAO_INVALIDA", "configuracao"));

    mockMvc.perform(get("/api/providers/onedrive/callback")
            .param("state", "state-invalid-client")
            .param("code", "code"))
        .andExpect(header().string("Location", Matchers.containsString("error=PROVEDOR_NAO_CONFIGURADO")));
    assertThat(oauthStateRepository.findByStateToken("state-invalid-client").orElseThrow().getUsedAt()).isNotNull();
  }

  @Test
  void otherExchangeFailuresStayGenericAndConsumeTheState() throws Exception {
    saveState("state-generic", "verifier-generic", false);
    when(microsoftOAuthClient.exchangeCode("code", "verifier-generic"))
        .thenThrow(new ReconnectionRequiredException());

    mockMvc.perform(get("/api/providers/onedrive/callback")
            .param("state", "state-generic")
            .param("code", "code"))
        .andExpect(header().string("Location", Matchers.containsString("error=OAUTH_TROCA_FALHOU")));
    assertThat(oauthStateRepository.findByStateToken("state-generic").orElseThrow().getUsedAt()).isNotNull();
  }

  @Test
  void connectWithoutClientAnswers503() throws Exception {
    when(providerOAuthClients.get(CloudProvider.ONEDRIVE)).thenThrow(ProviderOAuthClients.notConfigured());

    mockMvc.perform(post("/api/providers/onedrive/connect")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isServiceUnavailable())
        .andExpect(jsonPath("$.error.code").value("PROVEDOR_NAO_CONFIGURADO"));
  }

  @Test
  void clientsLookupThrowsWhenTheProviderHasNoClient() {
    ProviderOAuthClients clients = new ProviderOAuthClients(List.of());

    assertThatThrownBy(() -> clients.get(CloudProvider.DROPBOX))
        .isInstanceOfSatisfying(com.bridgit.api.common.error.ApiException.class, ex -> {
          assertThat(ex.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
          assertThat(ex.getCode()).isEqualTo("PROVEDOR_NAO_CONFIGURADO");
        });
  }

  @Test
  void disconnectProviderRemovesEveryConnectionOfThatProvider() throws Exception {
    saveConnection("account-a");
    saveConnection("account-b");

    mockMvc.perform(delete("/api/providers/onedrive")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.length()").value(3))
        .andExpect(jsonPath("$.data[0].connected").value(false))
        .andExpect(jsonPath("$.data[0].connections.length()").value(0));

    assertThat(connectionRepository.findByUserIdAndProviderOrderByCreatedAtAscIdAsc(
        userId, CloudProvider.ONEDRIVE.id())).isEmpty();
    org.mockito.Mockito.verify(microsoftOAuthClient, org.mockito.Mockito.times(2))
        .revoke(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("old-refresh-token"));
  }

  @Test
  void disconnectConnectionRemovesOnlyThatAccount() throws Exception {
    ProviderConnectionEntity first = saveConnection("account-a");
    ProviderConnectionEntity second = saveConnection("account-b");

    mockMvc.perform(delete("/api/connections/" + first.getId())
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.length()").value(3))
        .andExpect(jsonPath("$.data[0].connected").value(true))
        .andExpect(jsonPath("$.data[0].connectionId").value(second.getId().toString()))
        .andExpect(jsonPath("$.data[0].connections.length()").value(1))
        .andExpect(jsonPath("$.data[0].connections[0].connectionId").value(second.getId().toString()));

    assertThat(connectionRepository.findById(first.getId())).isEmpty();
    assertThat(connectionRepository.findById(second.getId())).isPresent();

    mockMvc.perform(delete("/api/connections/" + second.getId())
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[0].connected").value(false));
    assertThat(connectionRepository.findById(second.getId())).isEmpty();
  }

  @Test
  void disconnectForeignOrUnknownConnectionAnswers409() throws Exception {
    JsonNode other = registerUser("other_provider_user", "password123", UUID.randomUUID());
    UUID otherUserId = UUID.fromString(other.path("data").path("user").path("id").asText());
    ProviderConnectionEntity foreign = new ProviderConnectionEntity();
    foreign.setUserId(otherUserId);
    foreign.setProvider(CloudProvider.ONEDRIVE.id());
    foreign.setAccountId("foreign-account");
    foreign.setEncryptedRefreshToken(tokenCipher.encrypt("foreign-refresh-token"));
    foreign.setConnectedAt(OffsetDateTime.now());
    foreign = connectionRepository.save(foreign);

    mockMvc.perform(delete("/api/connections/" + foreign.getId())
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("PROVEDOR_NAO_CONECTADO"));
    assertThat(connectionRepository.findById(foreign.getId())).isPresent();

    mockMvc.perform(delete("/api/connections/" + UUID.randomUUID())
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("PROVEDOR_NAO_CONECTADO"));
  }

  @Test
  void disconnectConnectionWithoutJwtReturns401() throws Exception {
    mockMvc.perform(delete("/api/connections/" + UUID.randomUUID()))
        .andExpect(status().isUnauthorized());
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

  @Test
  void invalidateAfterProviderRefreshDiscardsStaleToken() {
    ProviderConnectionEntity saved = seedConnection();
    UUID connectionId = saved.getId();
    AtomicInteger calls = new AtomicInteger();

    when(microsoftOAuthClient.refresh(anyString())).thenAnswer(invocation -> {
      if (calls.getAndIncrement() == 0) {
        return new TokenResult("stale-access", "stale-rotated", 3600, "scope");
      }
      return new TokenResult("fresh-access", "fresh-rotated", 3600, "scope");
    });

    FindByIdHookConfig.hookArmed.set(true);

    assertThat(providerConnectionService.accessToken(saved)).isEqualTo("fresh-access");

    assertThat(tokenCipher.decrypt(
        connectionRepository.findById(connectionId).orElseThrow().getEncryptedRefreshToken()))
        .isEqualTo("fresh-rotated");
    assertThat(providerConnectionService.accessToken(saved)).isEqualTo("fresh-access");
    assertThat(calls.get()).isEqualTo(2);
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
