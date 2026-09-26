package com.bridgit.api.providers.graph;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.bridgit.api.providers.ProviderApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class GraphCursorSecurityTest {

  private GraphProviderClient client;
  private MockRestServiceServer server;

  @BeforeEach
  void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    RestClient shared = builder.build();
    client = new GraphProviderClient(shared, shared, new ObjectMapper());
  }

  @ParameterizedTest
  @ValueSource(strings = {
      "http://graph.microsoft.com/v1.0/me/drive/root/children",
      "https://graph.microsoft.com.evil.com/v1.0/me/drive/root/children",
      "https://evil.com/v1.0/me/drive/root/children",
      "https://graph.microsoft.com:8080/v1.0/me/drive/root/children",
      "https://graph.microsoft.com/v1.0/users/x",
      "https://user:pass@graph.microsoft.com/v1.0/me/drive/root/children",
      "https://127.0.0.1/v1.0/me/drive/root/children",
      "https://localhost/v1.0/me/drive/root/children",
      "not-a-url"
  })
  void rejectsUntrustedCursorWithoutNetworkCall(String cursor) {
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> client.list("token", null, cursor)
    );
    assertEquals("CURSOR_INVALIDO", ex.getCode());
    assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus());
    server.verify();
  }

  @Test
  void acceptsExactGraphHostWithDefaultPort() {
    String nextLink = "https://graph.microsoft.com:443/v1.0/me/drive/root/children?$skiptoken=abc";
    server.expect(requestTo(nextLink))
        .andRespond(withSuccess("{\"value\": []}", MediaType.APPLICATION_JSON));

    client.list("token", null, nextLink);
    server.verify();
  }
}
