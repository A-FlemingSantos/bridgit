package com.bridgit.api.integrations;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.headerDoesNotExist;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class DropboxOAuthClientTest {

  private static final String ACCOUNT = "https://api.dropboxapi.com/2/users/get_current_account";
  private static final String PHOTO = "https://dl-web.dropbox.com/account_photo/get/dbaphid%3AAAA?size=128";
  private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 1, 2, 3};

  private MockRestServiceServer server;
  private DropboxOAuthClient client;

  private void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    client = new DropboxOAuthClient(new CloudProvidersProperties(), builder, new ObjectMapper(), builder.build());
  }

  private void expectAccount(String photoUrl) {
    String json = photoUrl == null
        ? "{\"account_id\":\"dbid:1\"}"
        : "{\"account_id\":\"dbid:1\",\"profile_photo_url\":\"" + photoUrl + "\"}";
    server.expect(requestTo(ACCOUNT))
        .andExpect(method(HttpMethod.POST))
        .andExpect(header("Authorization", "Bearer tok"))
        .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));
  }

  private static DropboxOAuthClient configured() {
    CloudProvidersProperties properties = new CloudProvidersProperties();
    properties.getDropbox().setClientId("app-key");
    properties.getDropbox().setClientSecret("app-secret");
    properties.getDropbox().setRedirectUri("http://localhost:8080/api/providers/dropbox/callback");
    return new DropboxOAuthClient(properties, RestClient.builder(), new ObjectMapper());
  }

  @Test
  void authorizationUrlOmitsPkceAndRequestsOfflineAccess() {
    String url = configured().authorizationUrl("state-123", "challenge-abc");

    assertTrue(url.startsWith("https://www.dropbox.com/oauth2/authorize?"));
    assertTrue(url.contains("state=state-123"));
    assertTrue(url.contains("token_access_type=offline"));
    assertFalse(url.contains("code_challenge"));
  }

  @Test
  void authorizationUrlForcesReauthenticationOnlyWhenAddingAnAccount() {
    DropboxOAuthClient configured = configured();

    assertTrue(configured.authorizationUrl("s", "c", true).contains("force_reauthentication=true"));
    assertFalse(configured.authorizationUrl("s", "c", false).contains("force_reauthentication"));
    assertFalse(configured.authorizationUrl("s", "c").contains("force_reauthentication"));
  }

  @Test
  void fetchAvatarDownloadsTheProfilePhotoWithoutCredentialsAndWithoutReEncodingTheUrl() {
    setUp();
    expectAccount(PHOTO);
    server.expect(requestTo(PHOTO))
        .andExpect(method(HttpMethod.GET))
        .andExpect(headerDoesNotExist("Authorization"))
        .andRespond(withSuccess(JPEG, MediaType.IMAGE_JPEG));

    Optional<AvatarImage> avatar = client.fetchAvatar("tok");

    assertTrue(avatar.isPresent());
    assertArrayEquals(JPEG, avatar.get().bytes());
    assertEquals("image/jpeg", avatar.get().contentType());
    server.verify();
  }

  @Test
  void fetchAvatarIsEmptyWithoutAProfilePhotoUrl() {
    setUp();
    expectAccount(null);

    assertTrue(client.fetchAvatar("tok").isEmpty());
    server.verify();
  }

  @Test
  void fetchAvatarAcceptsDropboxUsercontentHosts() {
    setUp();
    expectAccount("https://dl.dropboxusercontent.com/p/a.jpg");
    server.expect(requestTo("https://dl.dropboxusercontent.com/p/a.jpg"))
        .andRespond(withSuccess(JPEG, MediaType.IMAGE_JPEG));

    assertTrue(client.fetchAvatar("tok").isPresent());
    server.verify();
  }

  @Test
  void fetchAvatarNeverDownloadsFromAnotherHostOrWithoutHttps() {
    for (String photo : new String[] {
        "https://evil.example.com/a.jpg",
        "https://evildropbox.com/a.jpg",
        "https://dropbox.com.evil.example.com/a.jpg",
        "http://dl-web.dropbox.com/a.jpg",
        "https://user@dl-web.dropbox.com/a.jpg"
    }) {
      setUp();
      expectAccount(photo);

      assertTrue(client.fetchAvatar("tok").isEmpty(), photo);
      server.verify();
    }
  }

  @Test
  void fetchAvatarIsEmptyWhenThePhotoRedirects() {
    setUp();
    expectAccount(PHOTO);
    server.expect(requestTo(PHOTO))
        .andRespond(withStatus(HttpStatus.FOUND).header("Location", "https://evil.example.com/x"));

    assertTrue(client.fetchAvatar("tok").isEmpty());
  }
}
