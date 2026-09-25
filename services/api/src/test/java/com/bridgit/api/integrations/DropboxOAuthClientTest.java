package com.bridgit.api.integrations;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class DropboxOAuthClientTest {

  @Test
  void authorizationUrlOmitsPkceAndRequestsOfflineAccess() {
    CloudProvidersProperties properties = new CloudProvidersProperties();
    properties.getDropbox().setClientId("app-key");
    properties.getDropbox().setClientSecret("app-secret");
    properties.getDropbox().setRedirectUri("http://localhost:8080/api/providers/dropbox/callback");
    DropboxOAuthClient client = new DropboxOAuthClient(properties, RestClient.builder(), new ObjectMapper());

    String url = client.authorizationUrl("state-123", "challenge-abc");

    assertTrue(url.startsWith("https://www.dropbox.com/oauth2/authorize?"));
    assertTrue(url.contains("state=state-123"));
    assertTrue(url.contains("token_access_type=offline"));
    assertFalse(url.contains("code_challenge"));
  }
}
