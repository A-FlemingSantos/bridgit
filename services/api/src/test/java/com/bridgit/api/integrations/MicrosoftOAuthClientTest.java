package com.bridgit.api.integrations;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
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

class MicrosoftOAuthClientTest {

  private static final String SIZED = "https://graph.microsoft.com/v1.0/me/photos/96x96/$value";
  private static final String ORIGINAL = "https://graph.microsoft.com/v1.0/me/photo/$value";
  private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 1, 2, 3};

  private MockRestServiceServer server;
  private MicrosoftOAuthClient client;

  private void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    client = new MicrosoftOAuthClient(new CloudProvidersProperties(), builder, new ObjectMapper());
  }

  @Test
  void authorizationUrlAsksToSelectTheAccount() {
    MicrosoftOAuthClient plain =
        new MicrosoftOAuthClient(new CloudProvidersProperties(), RestClient.builder(), new ObjectMapper());

    assertTrue(plain.authorizationUrl("s", "c").contains("prompt=select_account"));
    assertTrue(plain.authorizationUrl("s", "c", true).contains("prompt=select_account"));
  }

  @Test
  void fetchAvatarDownloadsTheSizedPhoto() {
    setUp();
    server.expect(requestTo(SIZED))
        .andExpect(method(HttpMethod.GET))
        .andExpect(header("Authorization", "Bearer tok"))
        .andRespond(withSuccess(JPEG, MediaType.IMAGE_JPEG));

    Optional<AvatarImage> avatar = client.fetchAvatar("tok");

    assertTrue(avatar.isPresent());
    assertArrayEquals(JPEG, avatar.get().bytes());
    assertEquals("image/jpeg", avatar.get().contentType());
    server.verify();
  }

  @Test
  void fetchAvatarFallsBackToTheOriginalPhotoWhenThereIsNoSizedOne() {
    for (HttpStatus missing : new HttpStatus[] {HttpStatus.NOT_FOUND, HttpStatus.BAD_REQUEST}) {
      setUp();
      server.expect(requestTo(SIZED)).andRespond(withStatus(missing));
      server.expect(requestTo(ORIGINAL))
          .andExpect(header("Authorization", "Bearer tok"))
          .andRespond(withSuccess(JPEG, MediaType.IMAGE_JPEG));

      assertTrue(client.fetchAvatar("tok").isPresent(), missing.toString());
      server.verify();
    }
  }

  @Test
  void fetchAvatarIsEmptyWhenNeitherPhotoExists() {
    setUp();
    server.expect(requestTo(SIZED)).andRespond(withStatus(HttpStatus.NOT_FOUND));
    server.expect(requestTo(ORIGINAL)).andRespond(withStatus(HttpStatus.NOT_FOUND));

    assertTrue(client.fetchAvatar("tok").isEmpty());
    server.verify();
  }

  @Test
  void fetchAvatarSignalsProviderFailuresInsteadOfNoPhoto() {
    setUp();
    server.expect(requestTo(SIZED)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));

    assertThrows(ProviderApiException.class, () -> client.fetchAvatar("tok"));
  }
}
