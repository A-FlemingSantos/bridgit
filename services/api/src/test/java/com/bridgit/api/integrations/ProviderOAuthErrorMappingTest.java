package com.bridgit.api.integrations;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.bridgit.api.providers.ProviderApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class ProviderOAuthErrorMappingTest {

  private static final String TOKEN_URL = "https://oauth2.googleapis.com/token";

  private GoogleOAuthClient client;
  private MockRestServiceServer server;

  @BeforeEach
  void setUp() {
    CloudProvidersProperties properties = new CloudProvidersProperties();
    properties.getGoogleDrive().setClientId("id");
    properties.getGoogleDrive().setClientSecret("secret");
    properties.getGoogleDrive().setRedirectUri("http://localhost/callback");

    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    client = new GoogleOAuthClient(properties, builder, new ObjectMapper());
  }

  @Test
  void invalidGrant400RequiresReconnection() {
    server.expect(requestTo(TOKEN_URL))
        .andRespond(withStatus(HttpStatus.BAD_REQUEST)
            .contentType(MediaType.APPLICATION_JSON)
            .body("{\"error\":\"invalid_grant\",\"error_description\":\"expired\"}"));

    assertThrows(ReconnectionRequiredException.class, () -> client.refresh("old-refresh"));
    server.verify();
  }

  @Test
  void invalidGrant401RequiresReconnection() {
    server.expect(requestTo(TOKEN_URL))
        .andRespond(withStatus(HttpStatus.UNAUTHORIZED)
            .contentType(MediaType.APPLICATION_JSON)
            .body("{\"error\":\"invalid_grant\"}"));

    assertThrows(ReconnectionRequiredException.class, () -> client.refresh("old-refresh"));
    server.verify();
  }

  @Test
  void invalidClientIsConfigurationError() {
    server.expect(requestTo(TOKEN_URL))
        .andRespond(withStatus(HttpStatus.UNAUTHORIZED)
            .contentType(MediaType.APPLICATION_JSON)
            .body("{\"error\":\"invalid_client\"}"));

    ProviderApiException ex = assertThrows(ProviderApiException.class, () -> client.refresh("old-refresh"));
    assertEquals("PROVEDOR_CONFIGURACAO_INVALIDA", ex.getCode());
    server.verify();
  }

  @Test
  void rateLimitedIsTransient() {
    server.expect(requestTo(TOKEN_URL))
        .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).body("slow down"));

    ProviderApiException ex = assertThrows(ProviderApiException.class, () -> client.refresh("old-refresh"));
    assertEquals("PROVEDOR_INDISPONIVEL", ex.getCode());
    assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatus());
    server.verify();
  }

  @Test
  void serverErrorIsTransient() {
    server.expect(requestTo(TOKEN_URL))
        .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR).body("boom"));

    ProviderApiException ex = assertThrows(ProviderApiException.class, () -> client.refresh("old-refresh"));
    assertEquals("PROVEDOR_INDISPONIVEL", ex.getCode());
    server.verify();
  }

  @Test
  void unparseableErrorBodyIsTransient() {
    server.expect(requestTo(TOKEN_URL))
        .andRespond(withStatus(HttpStatus.BAD_GATEWAY).body("<html>proxy</html>"));

    ProviderApiException ex = assertThrows(ProviderApiException.class, () -> client.refresh("old-refresh"));
    assertEquals("PROVEDOR_INDISPONIVEL", ex.getCode());
    server.verify();
  }

  @Test
  void invalidGrantInSuccessBodyRequiresReconnection() {
    server.expect(requestTo(TOKEN_URL))
        .andRespond(withSuccess("{\"error\":\"invalid_grant\"}", MediaType.APPLICATION_JSON));

    assertThrows(ReconnectionRequiredException.class, () -> client.refresh("old-refresh"));
    server.verify();
  }

  @Test
  void validResponseStillParses() {
    server.expect(requestTo(TOKEN_URL))
        .andRespond(withSuccess(
            "{\"access_token\":\"a\",\"refresh_token\":\"r\",\"expires_in\":3600}",
            MediaType.APPLICATION_JSON));

    TokenResult result = client.refresh("old-refresh");
    assertEquals("a", result.accessToken());
    assertEquals("r", result.refreshToken());
    server.verify();
  }
}
