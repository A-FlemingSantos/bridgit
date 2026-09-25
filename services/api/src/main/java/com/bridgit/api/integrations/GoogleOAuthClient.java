package com.bridgit.api.integrations;

import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.ProviderApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class GoogleOAuthClient extends AbstractProviderOAuthClient {

  private static final String AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
  private static final String TOKEN_URL = "https://oauth2.googleapis.com/token";
  private static final String ACCOUNT_URL = "https://openidconnect.googleapis.com/v1/userinfo";
  private static final String REVOKE_URL = "https://oauth2.googleapis.com/revoke";
  private static final String SCOPE =
      "openid https://www.googleapis.com/auth/userinfo.email "
          + "https://www.googleapis.com/auth/userinfo.profile "
          + "https://www.googleapis.com/auth/drive";

  public GoogleOAuthClient(
      CloudProvidersProperties properties,
      RestClient.Builder restClientBuilder,
      ObjectMapper objectMapper
  ) {
    super(properties, restClientBuilder.build(), objectMapper);
  }

  @Override
  public CloudProvider provider() {
    return CloudProvider.GOOGLE_DRIVE;
  }

  @Override
  public String authorizationUrl(String state, String codeChallenge) {
    CloudProvidersProperties.ProviderCredentials credentials = credentials();
    return buildQueryUrl(AUTHORIZE_URL, buildMap(map -> {
      map.put("client_id", credentials.getClientId());
      map.put("response_type", "code");
      map.put("redirect_uri", credentials.getRedirectUri());
      map.put("scope", SCOPE);
      map.put("state", state);
      map.put("code_challenge", codeChallenge);
      map.put("code_challenge_method", "S256");
      map.put("access_type", "offline");
      map.put("prompt", "consent");
      map.put("include_granted_scopes", "true");
    }));
  }

  @Override
  public TokenResult exchangeCode(String code, String codeVerifier) {
    CloudProvidersProperties.ProviderCredentials credentials = credentials();
    return postFormForToken(TOKEN_URL, formOf(buildMap(map -> {
      map.put("client_id", credentials.getClientId());
      map.put("client_secret", credentials.getClientSecret());
      map.put("grant_type", "authorization_code");
      map.put("code", code);
      map.put("redirect_uri", credentials.getRedirectUri());
      map.put("code_verifier", codeVerifier);
    })));
  }

  @Override
  public TokenResult refresh(String refreshToken) {
    CloudProvidersProperties.ProviderCredentials credentials = credentials();
    return postFormForToken(TOKEN_URL, formOf(buildMap(map -> {
      map.put("client_id", credentials.getClientId());
      map.put("client_secret", credentials.getClientSecret());
      map.put("grant_type", "refresh_token");
      map.put("refresh_token", refreshToken);
    })));
  }

  @Override
  public ProviderAccount fetchAccount(String accessToken) {
    String body = restClient.get()
        .uri(ACCOUNT_URL)
        .header("Authorization", "Bearer " + accessToken)
        .retrieve()
        .body(String.class);

    try {
      JsonNode json = objectMapper.readTree(body);
      String accountId = requiredText(json, "sub");
      String email = optionalText(json, "email");
      String name = optionalText(json, "name");
      return new ProviderAccount(accountId, email, name);
    } catch (ProviderApiException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new ProviderApiException("Nao foi possivel obter os dados da conta Google.");
    }
  }

  @Override
  public void revoke(String accessToken, String refreshToken) {
    String token = refreshToken != null && !refreshToken.isBlank() ? refreshToken : accessToken;
    if (token == null || token.isBlank()) {
      return;
    }
    try {
      restClient.post()
          .uri(REVOKE_URL + "?token=" + token)
          .retrieve()
          .toBodilessEntity();
    } catch (Exception ignored) {
      // best effort
    }
  }
}
