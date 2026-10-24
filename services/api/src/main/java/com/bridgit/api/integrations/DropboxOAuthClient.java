package com.bridgit.api.integrations;

import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.ProviderApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class DropboxOAuthClient extends AbstractProviderOAuthClient {

  private static final String AUTHORIZE_URL = "https://www.dropbox.com/oauth2/authorize";
  private static final String TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
  private static final String ACCOUNT_URL = "https://api.dropboxapi.com/2/users/get_current_account";
  private static final String REVOKE_URL = "https://api.dropboxapi.com/2/auth/token/revoke";

  @Autowired
  public DropboxOAuthClient(
      CloudProvidersProperties properties,
      RestClient.Builder restClientBuilder,
      ObjectMapper objectMapper
  ) {
    super(properties, restClientBuilder.build(), objectMapper, noRedirectClient());
  }

  DropboxOAuthClient(
      CloudProvidersProperties properties,
      RestClient.Builder restClientBuilder,
      ObjectMapper objectMapper,
      RestClient downloadClient
  ) {
    super(properties, restClientBuilder.build(), objectMapper, downloadClient);
  }

  @Override
  public CloudProvider provider() {
    return CloudProvider.DROPBOX;
  }

  // Dropbox rejects PKCE for confidential apps unless "Allow public clients" is enabled;
  // the app secret authenticates the code exchange instead.
  @Override
  public String authorizationUrl(String state, String codeChallenge) {
    return authorizationUrl(state, codeChallenge, false);
  }

  // Dropbox reuses the browser's signed-in account; force_reauthentication makes it ask which one.
  @Override
  public String authorizationUrl(String state, String codeChallenge, boolean addAccount) {
    CloudProvidersProperties.ProviderCredentials credentials = credentials();
    return buildQueryUrl(AUTHORIZE_URL, buildMap(map -> {
      map.put("client_id", credentials.getClientId());
      map.put("response_type", "code");
      map.put("redirect_uri", credentials.getRedirectUri());
      map.put("state", state);
      map.put("token_access_type", "offline");
      if (addAccount) {
        map.put("force_reauthentication", "true");
      }
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
      throw new ProviderApiException("Não foi possível obter os dados da conta Dropbox.");
    }
  }

  @Override
  public Optional<AvatarImage> fetchAvatar(String accessToken) {
    String body = restClient.post()
        .uri(ACCOUNT_URL)
        .header("Authorization", "Bearer " + accessToken)
        .contentType(MediaType.APPLICATION_JSON)
        .body("null")
        .retrieve()
        .body(String.class);

    String photoUrl;
    try {
      photoUrl = optionalText(objectMapper.readTree(body), "profile_photo_url");
    } catch (Exception ex) {
      throw new ProviderApiException("Não foi possível obter os dados da conta Dropbox.");
    }
    URI uri = photoUrl == null ? null : httpsUriOnHost(photoUrl, ".dropbox.com", ".dropboxusercontent.com");
    if (uri == null) {
      return Optional.empty();
    }
    // The photo URL is public: the access token must not travel to it.
    return downloadImage(downloadClient, uri, null, status -> status == 404 || status == 403);
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
