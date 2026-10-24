package com.bridgit.api.providers.graph;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.headerDoesNotExist;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.ProviderApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class GraphReplaceContentTest {

  private static final String URL = "https://graph.microsoft.com/v1.0/me/drive/items/item-1/content";
  private static final byte[] DATA = "hello world".getBytes(StandardCharsets.UTF_8);
  private static final String ITEM = """
      {"id":"item-1","name":"a.txt","size":11,"eTag":"etag-2","cTag":"ctag-2","file":{"mimeType":"text/plain"}}
      """;

  private GraphProviderClient client;
  private MockRestServiceServer server;

  @BeforeEach
  void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    RestClient shared = builder.build();
    client = new GraphProviderClient(shared, shared, new ObjectMapper());
  }

  private ProviderApiException failure(HttpStatus status, String body) {
    server.expect(requestTo(URL)).andRespond(withStatus(status).body(body));
    return assertThrows(ProviderApiException.class, () -> client.replaceContent("token", "item-1", "text/plain",
        DATA.length, new ByteArrayResource(DATA), "etag-1"));
  }

  @Test
  void putsBytesWithIfMatchAndReturnsItemWithUnknownParent() {
    server.expect(requestTo(URL))
        .andExpect(method(HttpMethod.PUT))
        .andExpect(header("If-Match", "etag-1"))
        .andExpect(header("Content-Type", "text/plain"))
        .andExpect(content().bytes(DATA))
        .andRespond(withSuccess(ITEM, MediaType.APPLICATION_JSON));

    CloudItem item = client.replaceContent("token", "item-1", "text/plain", DATA.length,
        new ByteArrayResource(DATA), "etag-1");

    assertEquals("item-1", item.ref());
    assertEquals("ctag-2", item.contentRevision());
    assertEquals("etag-2", item.remoteVersion());
    assertFalse(item.parentKnown());
    server.verify();
  }

  @Test
  void omitsIfMatchWhenNoVersion() {
    server.expect(requestTo(URL))
        .andExpect(headerDoesNotExist("If-Match"))
        .andRespond(withSuccess(ITEM, MediaType.APPLICATION_JSON));

    client.replaceContent("token", "item-1", "text/plain", DATA.length, new ByteArrayResource(DATA), null);
    server.verify();
  }

  @Test
  void preconditionFailedMapsToFileChanged() {
    ProviderApiException ex = failure(HttpStatus.PRECONDITION_FAILED, "");
    assertEquals("ARQUIVO_ALTERADO", ex.getCode());
    assertEquals(HttpStatus.CONFLICT, ex.getStatus());
  }

  @Test
  void conflictMapsToFileChanged() {
    assertEquals("ARQUIVO_ALTERADO", failure(HttpStatus.CONFLICT, "{\"error\":{\"code\":\"notAllowed\"}}").getCode());
  }

  @Test
  void lockedMapsToFileLocked() {
    ProviderApiException ex = failure(HttpStatus.LOCKED, "");
    assertEquals("ARQUIVO_BLOQUEADO", ex.getCode());
    assertEquals(HttpStatus.LOCKED, ex.getStatus());
  }

  @Test
  void otherErrorsUseWriteMapping() {
    assertEquals("ARQUIVO_GRANDE_DEMAIS", failure(HttpStatus.PAYLOAD_TOO_LARGE, "").getCode());
  }
}
