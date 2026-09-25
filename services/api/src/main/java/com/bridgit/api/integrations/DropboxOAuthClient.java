package com.bridgit.api.integrations;

import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.ProviderApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class DropboxOAuthClient extends AbstractProviderOAuthClient {

  private static final String AUTHORIZE_URL = "https://www.dropbox.com/oauth2/authorize";
  private static final String TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
  private static final String ACCOUNT_URL = "https://api.dropboxapi.com/2/users/get_current_account";
  private static final String REVOKE_URL = "https://api.dropboxapi.com/2/auth/token/revoke";

  public DropboxOAuthClient(
      CloudProvidersProperties properties,
      RestClient.Builder restClientBuilder,
      ObjectMapper objectMapper
  ) {
    super(properties, restClientBuilder.build(), objectMapper);
  }

  @Override
  public CloudProvider provider() {
    return CloudProvider.DROPBOX;
  }

  // Dropbox rejects PKCE for confidential apps unless "Allow public clients" is enabled;
  // the app secret authenticates the code exchange instead.
  @Override
  public String authorizationUrl(String state, String codeChallenge) {
    CloudProvidersProperties.ProviderCredentials credentials = credentials();
    return buildQueryUrl(AUTHORIZE_URL, buildMap(map -> {
      map.put("client_id", credentials.getClientId());
      map.put("response_type", "code");
      map.put("redirect_uri", credentials.getRedirectUri());
      map.put("state", state);
      map.put("token_access_type", "offline");
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
    String body = restClient.post()
        .uri(ACCOUNT_URL)
        .header("Authorization", "Bearer " + accessToken)
        .contentType(MediaType.APPLICATION_JSON)
        .body("null")
        .retrieve()
        .body(String.class);

    try {
      JsonNode json = objectMapper.readTree(body);
      String accountId = requiredText(json, "account_id");
      String email = optionalText(json, "email");
      String name = null;
      JsonNode nameNode = json.path("name");
      if (!nameNode.isMissingNode()) {
        name = optionalText(nameNode, "display_name");
      }
      return new ProviderAccount(accountId, email, name);
    } catch (ProviderApiException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new ProviderApiException("Nao foi possivel obter os dados da conta Dropbox.");
    }
  }

  @Override
  public void revoke(String accessToken, String refreshToken) {
    if (accessToken == null || accessToken.isBlank()) {
      return;
    }
    try {
      restClient.post()
          .uri(REVOKE_URL)
          .header("Authorization", "Bearer " + accessToken)
          .retrieve()
          .toBodilessEntity();
    } catch (Exception ignored) {
      // best effort
    }
  }
}
