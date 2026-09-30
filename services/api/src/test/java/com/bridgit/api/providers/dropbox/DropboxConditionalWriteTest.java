package com.bridgit.api.providers.dropbox;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.bridgit.api.providers.ProviderApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class DropboxConditionalWriteTest {

  private DropboxProviderClient client;
  private MockRestServiceServer server;

  @BeforeEach
  void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    client = new DropboxProviderClient(builder.build(), builder.build(), new ObjectMapper());
  }

  @Test
  void conditionalDeleteStopsWhenDropboxRevisionDiverges() {
    server.expect(requestTo("https://api.dropboxapi.com/2/files/get_metadata"))
        .andRespond(withSuccess("{\".tag\":\"file\",\"id\":\"id:file\",\"rev\":\"new-rev\"}",
            MediaType.APPLICATION_JSON));

    assertThrows(ProviderApiException.class,
        () -> client.deleteConditional("token", "id:file", "old-rev"));
    server.verify();
  }
}
