package com.bridgit.api.providers.dropbox;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.ProviderApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class DropboxReplaceContentTest {

  private static final String URL = "https://content.dropboxapi.com/2/files/upload";
  private static final byte[] DATA = "hello world".getBytes(StandardCharsets.UTF_8);
  private static final String ENTRY =
      "{\".tag\":\"file\",\"id\":\"id:file\",\"name\":\"a.txt\",\"size\":11,\"rev\":\"rev-2\",\"content_hash\":\"hash-2\"}";

  private DropboxProviderClient client;
  private MockRestServiceServer server;

  @BeforeEach
  void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    client = new DropboxProviderClient(builder.build(), builder.build(), new ObjectMapper());
  }

  private ProviderApiException conflict(String body) {
    server.expect(requestTo(URL))
        .andRespond(withStatus(HttpStatus.CONFLICT).contentType(MediaType.APPLICATION_JSON).body(body));
    return assertThrows(ProviderApiException.class, () -> client.replaceContent("token", "id:file", "text/plain",
        DATA.length, new ByteArrayResource(DATA), "rev-1"));
  }

  @Test
  void updateModeCarriesRevAndBytes() {
    server.expect(requestTo(URL))
        .andExpect(header("Dropbox-API-Arg", Matchers.containsString("\"update\":\"rev-1\"")))
        .andExpect(header("Dropbox-API-Arg", Matchers.containsString("\"path\":\"id:file\"")))
        .andExpect(header("Dropbox-API-Arg", Matchers.containsString("\"autorename\":false")))
        .andExpect(header("Dropbox-API-Arg", Matchers.containsString("\"strict_conflict\":true")))
        .andExpect(content().bytes(DATA))
        .andRespond(withSuccess(ENTRY, MediaType.APPLICATION_JSON));

    CloudItem item = client.replaceContent("token", "id:file", "text/plain", DATA.length,
        new ByteArrayResource(DATA), "rev-1");

    assertEquals("hash-2", item.contentRevision());
    assertEquals("rev-2", item.remoteVersion());
    assertFalse(item.parentKnown());
    server.verify();
  }

  @Test
  void overwriteModeWithoutVersion() {
    server.expect(requestTo(URL))
        .andExpect(header("Dropbox-API-Arg", Matchers.containsString("\"mode\":\"overwrite\"")))
        .andRespond(withSuccess(ENTRY, MediaType.APPLICATION_JSON));

    client.replaceContent("token", "id:file", "text/plain", DATA.length, new ByteArrayResource(DATA), null);
    server.verify();
  }

  @Test
  void conflictMapsToFileChanged() {
    ProviderApiException ex = conflict("{\"error_summary\":\"path/conflict/file/..\",\"error\":{\".tag\":\"path\","
        + "\"reason\":{\".tag\":\"conflict\",\"conflict\":{\".tag\":\"file\"}}}}");
    assertEquals("ARQUIVO_ALTERADO", ex.getCode());
    assertEquals(HttpStatus.CONFLICT, ex.getStatus());
  }

  @Test
  void otherConflictBodiesKeepExistingMapping() {
    ProviderApiException ex = conflict("{\"error_summary\":\"path/not_found/..\",\"error\":{\".tag\":\"path\","
        + "\"path\":{\".tag\":\"not_found\"}}}");
    assertEquals("ITEM_NAO_ENCONTRADO", ex.getCode());
  }
}
