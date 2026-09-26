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
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.util.UriComponentsBuilder;

@Service
public class ProviderConnectionService {

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
  private final TransactionTemplate requiresNewTemplate;
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
      @Value("${app.frontend-base-url}") String frontendBaseUrl
  ) {
    this.connectionRepository = connectionRepository;
    this.oauthStateRepository = oauthStateRepository;
    this.oauthClients = oauthClients;
    this.tokenCipher = tokenCipher;
    this.properties = properties;
    this.authenticatedUserService = authenticatedUserService;
    this.clock = clock;
    this.frontendBaseUrl = frontendBaseUrl;
    this.requiresNewTemplate = new TransactionTemplate(transactionManager);
    this.requiresNewTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }

  @Transactional(readOnly = true)
  public List<ProviderConnectionDtos.ProviderStatus> listForCurrentUser() {
    UUID userId = authenticatedUserService.requireUserId();
    Map<String, ProviderConnectionEntity> connections = connectionRepository.findByUserId(userId).stream()
        .collect(Collectors.toMap(ProviderConnectionEntity::getProvider, Function.identity()));

    return PROVIDER_ORDER.stream()
        .map(provider -> toStatus(provider, connections.get(provider.id())))
        .toList();
  }

  @Transactional
  public String startAuthorization(CloudProvider provider, String redirectTo) {
    UUID userId = authenticatedUserService.requireUserId();

    if (!properties.forProvider(provider).configured()) {
      throw new ApiException(
          HttpStatus.SERVICE_UNAVAILABLE,
          "PROVEDOR_NAO_CONFIGURADO",
          "Este provedor ainda nao foi configurado no servidor."
      );
    }

    String stateToken = OAuthSupport.randomBase64Url(32);
    String codeVerifier = OAuthSupport.generateCodeVerifier();
    String codeChallenge = OAuthSupport.pkceChallengeS256(codeVerifier);

    ProviderOAuthStateEntity stateEntity = new ProviderOAuthStateEntity();
    stateEntity.setUserId(userId);
    stateEntity.setProvider(provider.id());
    stateEntity.setStateToken(stateToken);
    stateEntity.setCodeVerifier(codeVerifier);
    stateEntity.setRedirectPath(sanitizeRedirectPath(redirectTo));
    stateEntity.setExpiresAt(OffsetDateTime.now(clock).plusMinutes(properties.getStateMinutes()));
    oauthStateRepository.save(stateEntity);

    ProviderOAuthClient client = oauthClients.get(provider);
    return client.authorizationUrl(stateToken, codeChallenge);
  }

  @Transactional
  public URI completeCallback(CloudProvider provider, String state, String code, String error) {
    String redirectPath = null;

    if (error != null && !error.isBlank()) {
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

    stateEntity.setUsedAt(now);
    oauthStateRepository.save(stateEntity);

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

      ProviderConnectionEntity connection = connectionRepository
          .findByUserIdAndProvider(stateEntity.getUserId(), provider.id())
          .orElseGet(ProviderConnectionEntity::new);

      connection.setUserId(stateEntity.getUserId());
      connection.setProvider(provider.id());
      connection.setAccountId(account.accountId());
      connection.setAccountEmail(account.email());
      connection.setAccountName(account.name());
      connection.setScopes(tokenResult.scope());
      connection.setEncryptedRefreshToken(tokenCipher.encrypt(refreshToken));
      connection.setConnectedAt(now);
      connection.setLastError(null);
      connectionRepository.save(connection);
      invalidate(connection.getId());

      return callbackRedirect(provider, "connected", null, redirectPath);
    } catch (Exception ex) {
      return callbackRedirect(provider, "error", "OAUTH_TROCA_FALHOU", redirectPath);
    }
  }

  @Transactional
  public List<ProviderConnectionDtos.ProviderStatus> disconnect(CloudProvider provider) {
    UUID userId = authenticatedUserService.requireUserId();

    connectionRepository.findByUserIdAndProvider(userId, provider.id()).ifPresent(connection -> {
      try {
        String refreshToken = tokenCipher.decrypt(connection.getEncryptedRefreshToken());
        ProviderOAuthClient client = oauthClients.get(provider);
        String accessToken = null;
        try {
          accessToken = client.refresh(refreshToken).accessToken();
        } catch (Exception ignored) {
          // best effort revoke without a fresh access token
        }
        client.revoke(accessToken, refreshToken);
      } catch (Exception ignored) {
        // best effort
      }

      invalidate(connection.getId());
      connectionRepository.delete(connection);
      invalidate(connection.getId());
    });

    return listForCurrentUser();
  }

  @Transactional(readOnly = true)
  public ProviderConnectionEntity requireConnection(UUID userId, CloudProvider provider) {
    return connectionRepository.findByUserIdAndProvider(userId, provider.id())
        .orElseThrow(() -> new ConflictException(
            "PROVEDOR_NAO_CONECTADO",
            "Conecte este provedor de nuvem antes de continuar."
        ));
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
      Optional<ProviderConnectionEntity> fresh = connectionRepository.findById(connectionId);
      if (fresh.isEmpty()) {
        return null;
      }
      ProviderConnectionEntity entity = fresh.get();
      if (!Objects.equals(entity.getEncryptedRefreshToken(), usedEncryptedRefresh)
          || !sameInstant(entity.getConnectedAt(), usedConnectedAt)) {
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

    accessTokenCache.put(connectionId, new CachedAccessToken(persisted, expiresAt));
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
      ProviderConnectionEntity connection
  ) {
    boolean configured = properties.forProvider(provider).configured();
    boolean connected = connection != null;
    ProviderConnectionDtos.ProviderAccountSummary account = null;
    OffsetDateTime connectedAt = null;
    String lastError = null;

    if (connection != null) {
      if (connection.getAccountEmail() != null || connection.getAccountName() != null) {
        account = new ProviderConnectionDtos.ProviderAccountSummary(
            connection.getAccountEmail(),
            connection.getAccountName()
        );
      }
      connectedAt = connection.getConnectedAt();
      lastError = connection.getLastError();
    }

    return new ProviderConnectionDtos.ProviderStatus(
        provider.id(),
        provider.displayName(),
        configured,
        connected,
        account,
        connectedAt,
        lastError
    );
  }

  private URI callbackRedirect(
      CloudProvider provider,
      String status,
      String errorCode,
      String redirectPath
  ) {
    UriComponentsBuilder builder = UriComponentsBuilder
        .fromUriString(trimTrailingSlash(frontendBaseUrl) + "/settings/providers")
        .queryParam("provider", "{provider}")
        .queryParam("status", "{status}");

    Map<String, String> variables = new HashMap<>();
    variables.put("provider", provider.id());
    variables.put("status", status);

    if (errorCode != null && !errorCode.isBlank()) {
      builder.queryParam("error", "{error}");
      variables.put("error", errorCode);
    }
    if (redirectPath != null && !redirectPath.isBlank()) {
      builder.queryParam("background", "{background}");
      variables.put("background", redirectPath);
    }

    return builder.encode().buildAndExpand(variables).toUri();
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
}
