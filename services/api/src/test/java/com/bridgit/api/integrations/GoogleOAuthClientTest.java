package com.bridgit.api.integrations;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.headerDoesNotExist;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.bridgit.api.providers.ProviderApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class GoogleOAuthClientTest {

  private static final String USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";
  private static final String PHOTO_PATH = "https://lh3.googleusercontent.com/a/abc";
  private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3};

  private MockRestServiceServer server;
  private GoogleOAuthClient avatarClient;

  private void setUpAvatarClient() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    avatarClient = new GoogleOAuthClient(new CloudProvidersProperties(), builder, new ObjectMapper(), builder.build());
  }

  private void expectUserinfo(String picture) {
    String json = picture == null
        ? "{\"sub\":\"1\"}"
        : "{\"sub\":\"1\",\"picture\":\"" + picture + "\"}";
    server.expect(requestTo(USERINFO))
        .andExpect(header("Authorization", "Bearer tok"))
        .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));
  }

  @Test
  void revokeSendsEncodedTokenAsFormBody() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    GoogleOAuthClient client = new GoogleOAuthClient(new CloudProvidersProperties(), builder, new ObjectMapper());

    server.expect(requestTo("https://oauth2.googleapis.com/revoke"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(header("Content-Type", MediaType.APPLICATION_FORM_URLENCODED_VALUE))
        .andExpect(content().string("token=1%2Fabc%26x%3Dy+z%23"))
        .andRespond(withSuccess());

    client.revoke("access", "1/abc&x=y z#");

    server.verify();
  }

  @Test
  void revokeFallsBackToAccessTokenWhenThereIsNoRefreshToken() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    GoogleOAuthClient client = new GoogleOAuthClient(new CloudProvidersProperties(), builder, new ObjectMapper());

    server.expect(requestTo("https://oauth2.googleapis.com/revoke"))
        .andExpect(content().string("token=ya29.access"))
        .andRespond(withSuccess());

    client.revoke("ya29.access", " ");

    server.verify();
  }

  @Test
  void authorizationUrlAlwaysAsksToSelectTheAccount() {
    GoogleOAuthClient client =
        new GoogleOAuthClient(new CloudProvidersProperties(), RestClient.builder(), new ObjectMapper());

    assertTrue(client.authorizationUrl("s", "c").contains("prompt=select_account%20consent"));
    assertTrue(client.authorizationUrl("s", "c", true).contains("prompt=select_account%20consent"));
    assertTrue(client.authorizationUrl("s", "c", false).contains("prompt=select_account%20consent"));
  }

  @Test
  void fetchAvatarResizesThePictureAndDownloadsItWithoutCredentials() {
    setUpAvatarClient();
    expectUserinfo(PHOTO_PATH + "=s96-c");
    server.expect(requestTo(PHOTO_PATH + "=s128-c"))
        .andExpect(method(HttpMethod.GET))
        .andExpect(headerDoesNotExist("Authorization"))
        .andRespond(withSuccess(PNG, MediaType.IMAGE_PNG));

    Optional<AvatarImage> avatar = avatarClient.fetchAvatar("tok");

    assertTrue(avatar.isPresent());
    assertArrayEquals(PNG, avatar.get().bytes());
    assertEquals("image/png", avatar.get().contentType());
    server.verify();
  }

  @Test
  void fetchAvatarRewritesASizeSuffixWithoutCropFlag() {
    setUpAvatarClient();
    expectUserinfo(PHOTO_PATH + "=s64");
    server.expect(requestTo(PHOTO_PATH + "=s128-c"))
        .andRespond(withSuccess(PNG, MediaType.IMAGE_PNG));

    assertTrue(avatarClient.fetchAvatar("tok").isPresent());
    server.verify();
  }

  @Test
  void fetchAvatarIsEmptyWithoutAPicture() {
    setUpAvatarClient();
    expectUserinfo(null);

    assertTrue(avatarClient.fetchAvatar("tok").isEmpty());
    server.verify();
  }

  @Test
  void fetchAvatarNeverDownloadsFromAnotherHostOrWithoutHttps() {
    for (String picture : new String[] {
        "https://evil.example.com/a=s96-c",
        "https://notgoogleusercontent.com/a=s96-c",
        "https://googleusercontent.com/a=s96-c",
        "http://lh3.googleusercontent.com/a=s96-c",
        "https://user@lh3.googleusercontent.com/a=s96-c",
        "https://lh3.googleusercontent.com:8443/a=s96-c",
        "not a url"
    }) {
      setUpAvatarClient();
      expectUserinfo(picture);

      assertTrue(avatarClient.fetchAvatar("tok").isEmpty(), picture);
      server.verify();
    }
  }

  @Test
  void fetchAvatarIsEmptyWhenThePhotoIsGone() {
    setUpAvatarClient();
    expectUserinfo(PHOTO_PATH + "=s96-c");
    server.expect(requestTo(PHOTO_PATH + "=s128-c")).andRespond(withStatus(HttpStatus.NOT_FOUND));

    assertTrue(avatarClient.fetchAvatar("tok").isEmpty());
  }

  @Test
  void fetchAvatarIsEmptyWhenThePhotoRedirects() {
    setUpAvatarClient();
    expectUserinfo(PHOTO_PATH + "=s96-c");
    server.expect(requestTo(PHOTO_PATH + "=s128-c"))
        .andRespond(withStatus(HttpStatus.FOUND).header("Location", "https://evil.example.com/x"));

    assertTrue(avatarClient.fetchAvatar("tok").isEmpty());
  }

  @Test
  void fetchAvatarIsEmptyWhenThePhotoIsTooLarge() {
    setUpAvatarClient();
    expectUserinfo(PHOTO_PATH + "=s96-c");
    server.expect(requestTo(PHOTO_PATH + "=s128-c"))
        .andRespond(withSuccess(new byte[AbstractProviderOAuthClient.MAX_AVATAR_BYTES + 1], MediaType.IMAGE_PNG));

    assertTrue(avatarClient.fetchAvatar("tok").isEmpty());
  }

  @Test
  void fetchAvatarSignalsProviderFailuresInsteadOfNoPhoto() {
    setUpAvatarClient();
    expectUserinfo(PHOTO_PATH + "=s96-c");
    server.expect(requestTo(PHOTO_PATH + "=s128-c")).andRespond(withServerError());

    assertThrows(ProviderApiException.class, () -> avatarClient.fetchAvatar("tok"));
  }
}
