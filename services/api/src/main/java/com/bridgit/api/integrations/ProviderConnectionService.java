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
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
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
  private final ConcurrentHashMap<UUID, CachedAccessToken> accessTokenCache = new ConcurrentHashMap<>();

  public ProviderConnectionService(
      ProviderConnectionRepository connectionRepository,
      ProviderOAuthStateRepository oauthStateRepository,
      ProviderOAuthClients oauthClients,
      IntegrationTokenCipher tokenCipher,
      CloudProvidersProperties properties,
      AuthenticatedUserService authenticatedUserService,
      Clock clock,
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
      evict(connection.getId());

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

      evict(connection.getId());
      connectionRepository.delete(connection);
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

  @Transactional(noRollbackFor = ReconnectionRequiredException.class)
  public String accessToken(ProviderConnectionEntity connection) {
    UUID connectionId = connection.getId();
    CachedAccessToken cached = accessTokenCache.get(connectionId);
    Instant now = clock.instant();

    if (cached != null && cached.expiresAt().isAfter(now.plusSeconds(60))) {
      return cached.accessToken();
    }

    CloudProvider provider = CloudProvider.fromId(connection.getProvider());
    ProviderOAuthClient client = oauthClients.get(provider);
    String refreshToken = tokenCipher.decrypt(connection.getEncryptedRefreshToken());

    try {
      TokenResult tokenResult = client.refresh(refreshToken);
      Instant expiresAt = now.plusSeconds(Math.max(tokenResult.expiresInSeconds(), 60));

      if (tokenResult.refreshToken() != null && !tokenResult.refreshToken().isBlank()) {
        connection.setEncryptedRefreshToken(tokenCipher.encrypt(tokenResult.refreshToken()));
      }
      connection.setLastError(null);
      connectionRepository.save(connection);

      accessTokenCache.put(connectionId, new CachedAccessToken(tokenResult.accessToken(), expiresAt));
      return tokenResult.accessToken();
    } catch (ReconnectionRequiredException ex) {
      connection.setLastError("RECONEXAO_NECESSARIA");
      connectionRepository.save(connection);
      evict(connectionId);
      throw ex;
    }
  }

  public void evict(UUID connectionId) {
    if (connectionId != null) {
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
}
