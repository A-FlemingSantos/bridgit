package com.bridgit.api.integrations;

import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class GoogleOAuthClientTest {

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
}
