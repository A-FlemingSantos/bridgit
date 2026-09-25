package com.bridgit.api.integrations;

import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.ProviderApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class MicrosoftOAuthClient extends AbstractProviderOAuthClient {

  private static final String AUTHORIZE_URL =
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
  private static final String TOKEN_URL =
      "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  private static final String ACCOUNT_URL = "https://graph.microsoft.com/v1.0/me";
  private static final String SCOPE =
      "offline_access openid profile email User.Read Files.ReadWrite";

  public MicrosoftOAuthClient(
      CloudProvidersProperties properties,
      RestClient.Builder restClientBuilder,
      ObjectMapper objectMapper
  ) {
    super(properties, restClientBuilder.build(), objectMapper);
  }

  @Override
  public CloudProvider provider() {
    return CloudProvider.ONEDRIVE;
  }

  @Override
  public String authorizationUrl(String state, String codeChallenge) {
    CloudProvidersProperties.ProviderCredentials credentials = credentials();
    return buildQueryUrl(AUTHORIZE_URL, buildMap(map -> {
      map.put("client_id", credentials.getClientId());
      map.put("response_type", "code");
      map.put("response_mode", "query");
      map.put("redirect_uri", credentials.getRedirectUri());
      map.put("scope", SCOPE);
      map.put("state", state);
      map.put("code_challenge", codeChallenge);
      map.put("code_challenge_method", "S256");
      map.put("prompt", "select_account");
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
      map.put("scope", SCOPE);
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
      map.put("scope", SCOPE);
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
      String accountId = requiredText(json, "id");
      String email = optionalText(json, "mail");
      if (email == null) {
        email = optionalText(json, "userPrincipalName");
      }
      String name = optionalText(json, "displayName");
      return new ProviderAccount(accountId, email, name);
    } catch (ProviderApiException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new ProviderApiException("Nao foi possivel obter os dados da conta Microsoft.");
    }
  }

  @Override
  public void revoke(String accessToken, String refreshToken) {
    // Microsoft Graph refresh tokens cannot be revoked via a simple endpoint in this flow.
  }
}
