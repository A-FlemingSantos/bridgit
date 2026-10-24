package com.bridgit.api.integrations;

import com.bridgit.api.common.error.ApiException;
import com.bridgit.api.common.error.ConflictException;
import com.bridgit.api.common.security.AuthenticatedUserService;
import com.bridgit.api.providers.CloudProvider;
import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

@Service
public class ProviderConnectionService {
  private static final Logger log = LoggerFactory.getLogger(ProviderConnectionService.class);

  @org.springframework.beans.factory.annotation.Autowired(required = false)
  private com.bridgit.api.catalog.LocalHubProperties localHubProperties;

  private static final List<CloudProvider> PROVIDER_ORDER = List.of(
      CloudProvider.ONEDRIVE,
      CloudProvider.GOOGLE_DRIVE,
      CloudProvider.DROPBOX
  );

  private final ProviderConnectionRepository connectionRepository;
  private final ProviderOAuthStateRepository oauthStateRepository;
  private final ProviderOAuthClients oauthClients;
  private final IntegrationTokenCipher tokenCipher;
  private final CloudProvidersProperties properties;
  private final AuthenticatedUserService authenticatedUserService;
  private final Clock clock;
  private final String frontendBaseUrl;
  private final List<String> mobileRedirectPrefixes;
  private final TransactionTemplate requiresNewTemplate;
  private final TransactionTemplate defaultTemplate;
  private final ConcurrentHashMap<UUID, CachedAccessToken> accessTokenCache = new ConcurrentHashMap<>();
  private final ConcurrentHashMap<UUID, CompletableFuture<RefreshOutcome>> inFlightRefreshes =
      new ConcurrentHashMap<>();
  private final ConcurrentHashMap<UUID, AtomicLong> refreshGenerations = new ConcurrentHashMap<>();

  public ProviderConnectionService(
      ProviderConnectionRepository connectionRepository,
      ProviderOAuthStateRepository oauthStateRepository,
      ProviderOAuthClients oauthClients,
      IntegrationTokenCipher tokenCipher,
      CloudProvidersProperties properties,
      AuthenticatedUserService authenticatedUserService,
      Clock clock,
      PlatformTransactionManager transactionManager,
      @Value("${app.frontend-base-url}") String frontendBaseUrl,
      @Value("${app.mobile-redirect-prefixes:bridgit://}") String mobileRedirectPrefixes
  ) {
    this.connectionRepository = connectionRepository;
    this.oauthStateRepository = oauthStateRepository;
    this.oauthClients = oauthClients;
    this.tokenCipher = tokenCipher;
    this.properties = properties;
    this.authenticatedUserService = authenticatedUserService;
    this.clock = clock;
    this.frontendBaseUrl = frontendBaseUrl;
    this.mobileRedirectPrefixes = parsePrefixes(mobileRedirectPrefixes);
    this.defaultTemplate = new TransactionTemplate(transactionManager);
    this.requiresNewTemplate = new TransactionTemplate(transactionManager);
    this.requiresNewTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }

  @Transactional(readOnly = true)
  public List<ProviderConnectionDtos.ProviderStatus> listForCurrentUser() {
    UUID userId = authenticatedUserService.requireUserId();
    // A user may hold several accounts of one provider, so group instead of keying by provider.
    Map<String, List<ProviderConnectionEntity>> connections =
        connectionRepository.findByUserIdOrderByCreatedAtAscIdAsc(userId).stream()
            .collect(Collectors.groupingBy(ProviderConnectionEntity::getProvider));

    return PROVIDER_ORDER.stream()
        .map(provider -> toStatus(provider, connections.getOrDefault(provider.id(), List.of())))
        .toList();
  }

  @Transactional
  public String startAuthorization(CloudProvider provider, String redirectTo, boolean addAccount) {
    UUID userId = authenticatedUserService.requireUserId();

    if (!properties.forProvider(provider).configured()) {
      throw ProviderOAuthClients.notConfigured();
    }
    ProviderOAuthClient client = oauthClients.get(provider);

    String stateToken = OAuthSupport.randomBase64Url(32);
    String codeVerifier = OAuthSupport.generateCodeVerifier();
    String codeChallenge = OAuthSupport.pkceChallengeS256(codeVerifier);

    ProviderOAuthStateEntity stateEntity = new ProviderOAuthStateEntity();
    stateEntity.setUserId(userId);
    stateEntity.setProvider(provider.id());
    stateEntity.setStateToken(stateToken);
    stateEntity.setCodeVerifier(codeVerifier);
    stateEntity.setRedirectPath(sanitizeRedirect(redirectTo));
    stateEntity.setExpiresAt(OffsetDateTime.now(clock).plusMinutes(properties.getStateMinutes()));
    oauthStateRepository.save(stateEntity);

    return client.authorizationUrl(stateToken, codeChallenge, addAccount);
  }

  @Transactional
  public URI completeCallback(CloudProvider provider, String state, String code, String error) {
    String redirectPath = null;

    if (error != null && !error.isBlank()) {
      // The state is not consumed here; it only tells us where the user started (web page or app).
      if (state != null && !state.isBlank()) {
        redirectPath = oauthStateRepository.findByStateToken(state)
            .map(ProviderOAuthStateEntity::getRedirectPath)
            .orElse(null);
      }
      return callbackRedirect(provider, "error", "PROVEDOR_RECUSOU", redirectPath);
    }

    if (state == null || state.isBlank()) {
      return callbackRedirect(provider, "error", "OAUTH_STATE_INVALIDO", redirectPath);
    }

    Optional<ProviderOAuthStateEntity> stateOptional = oauthStateRepository.findByStateToken(state);
    if (stateOptional.isEmpty()) {
      return callbackRedirect(provider, "error", "OAUTH_STATE_INVALIDO", redirectPath);
    }

    ProviderOAuthStateEntity stateEntity = stateOptional.get();
    redirectPath = stateEntity.getRedirectPath();

    if (!provider.id().equals(stateEntity.getProvider())) {
      return callbackRedirect(provider, "error", "OAUTH_STATE_INVALIDO", redirectPath);
    }

    OffsetDateTime now = OffsetDateTime.now(clock);
    if (stateEntity.getUsedAt() != null || stateEntity.getExpiresAt().isBefore(now)) {
      return callbackRedirect(provider, "error", "OAUTH_STATE_EXPIRADO", redirectPath);
    }

    // Marked before the exchange so a concurrent callback cannot reuse the same state. It is committed on its own
    // (the exchange runs inside the outer transaction) and only released again for transient failures.
    Integer marked = requiresNewTemplate.execute(
        status -> oauthStateRepository.markUsed(stateEntity.getId(), now));
    if (marked == null || marked == 0) {
      return callbackRedirect(provider, "error", "OAUTH_STATE_EXPIRADO", redirectPath);
    }

    if (code == null || code.isBlank()) {
      return callbackRedirect(provider, "error", "OAUTH_CODE_AUSENTE", redirectPath);
    }

    try {
      ProviderOAuthClient client = oauthClients.get(provider);
      TokenResult tokenResult = client.exchangeCode(code, stateEntity.getCodeVerifier());

      String refreshToken = tokenResult.refreshToken();
      if (refreshToken == null || refreshToken.isBlank()) {
        return callbackRedirect(provider, "error", "REFRESH_TOKEN_AUSENTE", redirectPath);
      }

      ProviderAccount account = client.fetchAccount(tokenResult.accessToken());

      UUID connectionId = upsertConnection(
          stateEntity.getUserId(), provider, account, tokenResult, refreshToken, now);
      invalidate(connectionId);

      return callbackRedirect(provider, "connected", null, redirectPath, connectionId);
    } catch (Exception ex) {
      ExchangeFailure failure = classifyExchangeFailure(ex);
      // Only the provider, the exception class and the API code: never tokens, the code or the state.
      log.warn("Falha ao concluir o OAuth provider={} tipo={} codigo={} classe={}",
          provider.id(), failure.name(), ex instanceof ApiException api ? api.getCode() : "-",
          ex.getClass().getSimpleName());
      if (failure == ExchangeFailure.TRANSIENT) {
        requiresNewTemplate.executeWithoutResult(
            status -> oauthStateRepository.release(stateEntity.getId()));
      }
      return callbackRedirect(provider, "error", failure.errorCode, redirectPath);
    }
  }

  /**
   * Inserts the account or, when this remote account is already connected, refreshes it in place (same id,
   * generation + 1). Runs in its own transaction so a unique-constraint race between two concurrent callbacks
   * for the same new account surfaces here, where the loser re-reads and takes the refresh path.
   */
  private UUID upsertConnection(
      UUID userId,
      CloudProvider provider,
      ProviderAccount account,
      TokenResult tokenResult,
      String refreshToken,
      OffsetDateTime now
  ) {
    try {
      return writeConnection(userId, provider, account, tokenResult, refreshToken, now);
    } catch (DataIntegrityViolationException race) {
      return writeConnection(userId, provider, account, tokenResult, refreshToken, now);
    }
  }

  private UUID writeConnection(
      UUID userId,
      CloudProvider provider,
      ProviderAccount account,
      TokenResult tokenResult,
      String refreshToken,
      OffsetDateTime now
  ) {
    return requiresNewTemplate.execute(status -> {
      ProviderConnectionEntity connection = connectionRepository
          .findByUserIdAndProviderAndAccountId(userId, provider.id(), account.accountId())
          .orElse(null);
      if (connection == null) {
        connection = new ProviderConnectionEntity();
      } else {
        connection.setGeneration(connection.getGeneration() + 1);
      }

      connection.setUserId(userId);
      connection.setProvider(provider.id());
      connection.setAccountId(account.accountId());
      connection.setAccountEmail(account.email());
      connection.setAccountName(account.name());
      connection.setScopes(tokenResult.scope());
      connection.setEncryptedRefreshToken(tokenCipher.encrypt(refreshToken));
      connection.setConnectedAt(now);
      connection.setLastError(null);
      return connectionRepository.saveAndFlush(connection).getId();
    });
  }

  private enum ExchangeFailure {
    CONFIGURATION("PROVEDOR_NAO_CONFIGURADO"),
    TRANSIENT("OAUTH_TROCA_TEMPORARIA"),
    FAILED("OAUTH_TROCA_FALHOU");

    private final String errorCode;

    ExchangeFailure(String errorCode) {
      this.errorCode = errorCode;
    }
  }

  private static ExchangeFailure classifyExchangeFailure(Throwable ex) {
    if (ex instanceof ApiException api) {
      String apiCode = api.getCode();
      if ("PROVEDOR_NAO_CONFIGURADO".equals(apiCode) || "PROVEDOR_CONFIGURACAO_INVALIDA".equals(apiCode)) {
        return ExchangeFailure.CONFIGURATION;
      }
      if ("PROVEDOR_INDISPONIVEL".equals(apiCode)) {
        return ExchangeFailure.TRANSIENT;
      }
      return ExchangeFailure.FAILED;
    }
    if (ex instanceof RestClientResponseException response) {
      int statusCode = response.getStatusCode().value();
      return statusCode == 429 || statusCode >= 500 ? ExchangeFailure.TRANSIENT : ExchangeFailure.FAILED;
    }
    if (ex instanceof ResourceAccessException || ex instanceof java.io.IOException
        || ex.getCause() instanceof java.io.IOException) {
      return ExchangeFailure.TRANSIENT;
    }
    return ExchangeFailure.FAILED;
  }

  /** Disconnects every account the user has connected for the provider. */
  public List<ProviderConnectionDtos.ProviderStatus> disconnect(CloudProvider provider) {
    UUID userId = authenticatedUserService.requireUserId();

    List<Revocation> revocations = defaultTemplate.execute(status ->
        connectionRepository.findByUserIdAndProviderOrderByCreatedAtAscIdAsc(userId, provider.id()).stream()
            .map(this::removeConnection)
            .toList());
    // The remote revoke is a network call: it runs after the delete has committed.
    revokeBestEffort(revocations);

    return listForCurrentUser();
  }

  /** Disconnects one connection; unknown and foreign ids answer 409 PROVEDOR_NAO_CONECTADO. */
  public List<ProviderConnectionDtos.ProviderStatus> disconnect(UUID connectionId) {
    UUID userId = authenticatedUserService.requireUserId();

    Revocation revocation = defaultTemplate.execute(status -> removeConnection(
        connectionRepository.findByIdAndUserId(connectionId, userId)
            .orElseThrow(ProviderConnectionService::notConnected)));
    revokeBestEffort(java.util.Collections.singletonList(revocation));

    return listForCurrentUser();
  }

  /** Deletes the row inside the caller's transaction and returns what is needed to revoke it remotely. */
  private Revocation removeConnection(ProviderConnectionEntity connection) {
    Revocation revocation = null;
    try {
      revocation = new Revocation(
          CloudProvider.fromId(connection.getProvider()),
          tokenCipher.decrypt(connection.getEncryptedRefreshToken()));
    } catch (Exception ignored) {
      // best effort: without the token there is nothing to revoke
    }

    invalidate(connection.getId());
    connectionRepository.delete(connection);
    invalidate(connection.getId());
    return revocation;
  }

  private void revokeBestEffort(List<Revocation> revocations) {
    for (Revocation revocation : revocations) {
      if (revocation == null) {
        continue;
      }
      try {
        ProviderOAuthClient client = oauthClients.get(revocation.provider());
        String accessToken = null;
        try {
          accessToken = client.refresh(revocation.refreshToken()).accessToken();
        } catch (Exception ignored) {
          // best effort revoke without a fresh access token
        }
        client.revoke(accessToken, revocation.refreshToken());
      } catch (Exception ignored) {
        // best effort
      }
    }
  }

  /** Oldest connection of the provider; serves the provider-keyed routes kept for older clients. */
  @Transactional(readOnly = true)
  public ProviderConnectionEntity requireDefaultConnection(UUID userId, CloudProvider provider) {
    return connectionRepository.findFirstByUserIdAndProviderOrderByCreatedAtAscIdAsc(userId, provider.id())
        .orElseThrow(ProviderConnectionService::notConnected);
  }

  /** Connection by id, only when it belongs to the user; unknown and foreign ids look the same. */
  @Transactional(readOnly = true)
  public ProviderConnectionEntity requireOwnedConnection(UUID userId, UUID connectionId) {
    return findOwned(userId, connectionId).orElseThrow(ProviderConnectionService::notConnected);
  }

  @Transactional(readOnly = true)
  public Optional<ProviderConnectionEntity> findOwned(UUID userId, UUID connectionId) {
    if (userId == null || connectionId == null) {
      return Optional.empty();
    }
    return connectionRepository.findByIdAndUserId(connectionId, userId);
  }

  /** @deprecated resolve by connection id, or use {@link #requireDefaultConnection}. */
  @Deprecated
  @Transactional(readOnly = true)
  public ProviderConnectionEntity requireConnection(UUID userId, CloudProvider provider) {
    return requireDefaultConnection(userId, provider);
  }

  private static ConflictException notConnected() {
    return new ConflictException(
        "PROVEDOR_NAO_CONECTADO",
        "Conecte este provedor de nuvem antes de continuar."
    );
  }

  @Transactional(readOnly = true)
  public Optional<ProviderConnectionEntity> findById(UUID connectionId) {
    return connectionRepository.findById(connectionId);
  }

  public String accessToken(ProviderConnectionEntity connection) {
    UUID connectionId = connection.getId();
    CachedAccessToken cached = accessTokenCache.get(connectionId);
    Instant now = clock.instant();

    if (cached != null && cached.expiresAt().isAfter(now.plusSeconds(60))) {
      return cached.accessToken();
    }

    CompletableFuture<RefreshOutcome> future = new CompletableFuture<>();
    CompletableFuture<RefreshOutcome> existing = inFlightRefreshes.putIfAbsent(connectionId, future);
    if (existing != null) {
      try {
        return existing.join().accessToken();
      } catch (CompletionException ex) {
        throw unwrapCompletion(ex);
      }
    }

    try {
      RefreshOutcome outcome = doRefresh(connection, now);
      if (outcome == null) {
        ProviderConnectionEntity current = connectionRepository.findById(connectionId)
            .orElseThrow(ReconnectionRequiredException::new);
        outcome = doRefresh(current, now);
        if (outcome == null) {
          throw new ReconnectionRequiredException();
        }
      }
      future.complete(outcome);
      return outcome.accessToken();
    } catch (Throwable ex) {
      future.completeExceptionally(ex);
      throw ex;
    } finally {
      inFlightRefreshes.remove(connectionId, future);
    }
  }

  private RefreshOutcome doRefresh(ProviderConnectionEntity connection, Instant now) {
    UUID connectionId = connection.getId();
    long generation = generationOf(connectionId);
    String usedEncryptedRefresh = connection.getEncryptedRefreshToken();
    OffsetDateTime usedConnectedAt = connection.getConnectedAt();

    CloudProvider provider = CloudProvider.fromId(connection.getProvider());
    ProviderOAuthClient client = oauthClients.get(provider);
    String refreshToken = tokenCipher.decrypt(usedEncryptedRefresh);

    TokenResult tokenResult;
    try {
      tokenResult = client.refresh(refreshToken);
    } catch (ReconnectionRequiredException ex) {
      markReconnectionRequired(connectionId);
      evict(connectionId);
      throw ex;
    }

    Instant expiresAt = now.plusSeconds(Math.max(tokenResult.expiresInSeconds(), 60));
    String rotatedRefresh = tokenResult.refreshToken();

    if (generation != generationOf(connectionId)) {
      evict(connectionId);
      return null;
    }

    String persisted = requiresNewTemplate.execute(status -> {
      if (generation != generationOf(connectionId)) {
        return null;
      }
      Optional<ProviderConnectionEntity> fresh = connectionRepository.findById(connectionId);
      if (fresh.isEmpty()) {
        return null;
      }
      ProviderConnectionEntity entity = fresh.get();
      if (!Objects.equals(entity.getEncryptedRefreshToken(), usedEncryptedRefresh)
          || !sameInstant(entity.getConnectedAt(), usedConnectedAt)) {
        return null;
      }
      if (generation != generationOf(connectionId)) {
        return null;
      }
      if (rotatedRefresh != null && !rotatedRefresh.isBlank()) {
        entity.setEncryptedRefreshToken(tokenCipher.encrypt(rotatedRefresh));
      }
      entity.setLastError(null);
      connectionRepository.save(entity);
      return tokenResult.accessToken();
    });

    if (persisted == null) {
      evict(connectionId);
      return null;
    }

    if (generation != generationOf(connectionId)) {
      evict(connectionId);
      return null;
    }

    CachedAccessToken cached = new CachedAccessToken(persisted, expiresAt);
    accessTokenCache.put(connectionId, cached);
    if (generation != generationOf(connectionId)) {
      accessTokenCache.remove(connectionId, cached);
    }
    return new RefreshOutcome(persisted);
  }

  private void markReconnectionRequired(UUID connectionId) {
    requiresNewTemplate.executeWithoutResult(status -> {
      connectionRepository.findById(connectionId).ifPresent(entity -> {
        entity.setLastError("RECONEXAO_NECESSARIA");
        connectionRepository.save(entity);
      });
    });
  }

  private static boolean sameInstant(OffsetDateTime first, OffsetDateTime second) {
    if (first == null || second == null) {
      return first == null && second == null;
    }
    return first.toInstant().toEpochMilli() == second.toInstant().toEpochMilli();
  }

  private static RuntimeException unwrapCompletion(CompletionException ex) {
    if (ex.getCause() instanceof RuntimeException cause) {
      return cause;
    }
    return ex;
  }

  private long generationOf(UUID connectionId) {
    AtomicLong generation = refreshGenerations.get(connectionId);
    return generation == null ? 0L : generation.get();
  }

  public void evict(UUID connectionId) {
    if (connectionId != null) {
      accessTokenCache.remove(connectionId);
    }
  }

  // Connection identity changed (reconnect/disconnect): in-flight refreshes must not publish their result.
  public void invalidate(UUID connectionId) {
    if (connectionId != null) {
      refreshGenerations.computeIfAbsent(connectionId, key -> new AtomicLong()).incrementAndGet();
      accessTokenCache.remove(connectionId);
    }
  }

  private ProviderConnectionDtos.ProviderStatus toStatus(
      CloudProvider provider,
      List<ProviderConnectionEntity> providerConnections
  ) {
    boolean configured = properties.forProvider(provider).configured();
    boolean operationsEnabled = operationsEnabled(provider);
    List<ProviderConnectionDtos.ConnectionStatus> connections = providerConnections.stream()
        .map(connection -> toConnectionStatus(provider, connection, operationsEnabled))
        .toList();

    // Top-level fields describe the oldest connection so clients that predate multiple accounts keep working.
    ProviderConnectionDtos.ConnectionStatus oldest = connections.isEmpty() ? null : connections.get(0);

    return new ProviderConnectionDtos.ProviderStatus(
        provider.id(),
        provider.displayName(),
        configured,
        oldest != null,
        oldest == null ? null : oldest.account(),
        oldest == null ? null : oldest.connectedAt(),
        oldest == null ? null : oldest.lastError(),
        oldest == null ? null : oldest.connectionId(),
        oldest == null ? null : oldest.generation(),
        oldest == null ? null : oldest.syncState(),
        operationsEnabled,
        connections
    );
  }

  private ProviderConnectionDtos.ConnectionStatus toConnectionStatus(
      CloudProvider provider,
      ProviderConnectionEntity connection,
      boolean operationsEnabled
  ) {
    ProviderConnectionDtos.ProviderAccountSummary account = null;
    if (connection.getAccountEmail() != null || connection.getAccountName() != null) {
      account = new ProviderConnectionDtos.ProviderAccountSummary(
          connection.getAccountEmail(),
          connection.getAccountName()
      );
    }
    String lastError = connection.getLastError();

    return new ProviderConnectionDtos.ConnectionStatus(
        connection.getId(),
        provider.id(),
        provider.displayName(),
        account,
        connection.getConnectedAt(),
        connection.getCreatedAt(),
        lastError,
        connection.getGeneration(),
        lastError == null ? "scheduled" : "attention",
        operationsEnabled
    );
  }

  private boolean operationsEnabled(CloudProvider provider) {
    return localHubProperties != null
        && localHubProperties.isOperationsEnabled()
        && localHubProperties.providerEnabled(provider.id());
  }

  private URI callbackRedirect(
      CloudProvider provider,
      String status,
      String errorCode,
      String redirectPath
  ) {
    return callbackRedirect(provider, status, errorCode, redirectPath, null);
  }

  private URI callbackRedirect(
      CloudProvider provider,
      String status,
      String errorCode,
      String redirectPath,
      UUID connectionId
  ) {
    // A mobile redirect sends the user back into the app. It carries only the outcome, never tokens or codes.
    boolean toApp = isMobileRedirect(redirectPath);
    UriComponentsBuilder builder = UriComponentsBuilder
        .fromUriString(toApp ? redirectPath : trimTrailingSlash(frontendBaseUrl) + "/settings/providers")
        .queryParam("provider", "{provider}")
        .queryParam("status", "{status}");

    Map<String, String> variables = new HashMap<>();
    variables.put("provider", provider.id());
    variables.put("status", status);

    if (connectionId != null) {
      builder.queryParam("connection", "{connection}");
      variables.put("connection", connectionId.toString());
    }
    if (errorCode != null && !errorCode.isBlank()) {
      builder.queryParam("error", "{error}");
      variables.put("error", errorCode);
    }
    if (!toApp && redirectPath != null && !redirectPath.isBlank()) {
      builder.queryParam("background", "{background}");
      variables.put("background", redirectPath);
    }

    return builder.encode().buildAndExpand(variables).toUri();
  }

  private static List<String> parsePrefixes(String value) {
    if (value == null || value.isBlank()) {
      return List.of();
    }
    return java.util.Arrays.stream(value.split(","))
        .map(String::trim)
        .filter(prefix -> prefix.contains("://"))
        .toList();
  }

  // A web path, or a URL that starts with one of the configured mobile app prefixes.
  String sanitizeRedirect(String redirectTo) {
    String path = sanitizeRedirectPath(redirectTo);
    if (path != null || redirectTo == null) {
      return path;
    }
    String trimmed = redirectTo.trim();
    if (trimmed.length() > 500 || trimmed.chars().anyMatch(ch -> Character.isWhitespace(ch) || Character.isISOControl(ch))) {
      return null;
    }
    return isMobileRedirect(trimmed) ? trimmed : null;
  }

  private boolean isMobileRedirect(String value) {
    return value != null && mobileRedirectPrefixes.stream().anyMatch(value::startsWith);
  }

  static String sanitizeRedirectPath(String redirectTo) {
    if (redirectTo == null || redirectTo.isBlank()) {
      return null;
    }
    String trimmed = redirectTo.trim();
    if (trimmed.length() > 500) {
      return null;
    }
    if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.contains("://")) {
      return null;
    }
    return trimmed;
  }

  private static String trimTrailingSlash(String value) {
    if (value == null || value.isBlank()) {
      return value;
    }
    return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
  }

  private record CachedAccessToken(String accessToken, Instant expiresAt) {
  }

  private record RefreshOutcome(String accessToken) {
  }

  private record Revocation(CloudProvider provider, String refreshToken) {
  }
}
