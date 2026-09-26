package com.bridgit.api.providers.drive;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.bridgit.api.providers.CloudItem;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class DriveSearchFieldsTest {

  private GoogleDriveProviderClient client;
  private MockRestServiceServer server;

  @BeforeEach
  void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    client = new GoogleDriveProviderClient(builder.build(), new ObjectMapper());
  }

  @Test
  void searchUsesListMaskAndReturnsUnknownParents() {
    AtomicReference<URI> requested = new AtomicReference<>();
    server.expect(request -> {
      requested.set(request.getURI());
      assertTrue(request.getURI().toString().contains("/drive/v3/files?"));
    }).andRespond(withSuccess("""
        {"files": [
          {"id": "a", "name": "Alpha.txt", "mimeType": "text/plain", "size": "3",
           "modifiedTime": "2026-01-01T00:00:00Z", "parents": ["root-id"]},
          {"id": "b", "name": "Beta.txt", "mimeType": "text/plain",
           "modifiedTime": "2026-01-02T00:00:00Z"}
        ]}
        """, MediaType.APPLICATION_JSON));

    List<CloudItem> results = client.search("token", "alpha", 10);

    Map<String, String> params = queryParams(requested.get());
    assertEquals(GoogleDriveProviderClient.LIST_FIELDS, params.get("fields"));
    assertEquals(2, results.size());
    for (CloudItem item : results) {
      assertNull(item.parentRef());
      assertFalse(item.parentKnown());
    }
    server.verify();
  }

  @Test
  void searchEmptyReturnsEmpty() {
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/drive/v3/files?")))
        .andRespond(withSuccess("{\"files\": []}", MediaType.APPLICATION_JSON));

    assertTrue(client.search("token", "zzz", 10).isEmpty());
    server.verify();
  }

  private static Map<String, String> queryParams(URI uri) {
    Map<String, String> params = new LinkedHashMap<>();
    for (String pair : uri.getRawQuery().split("&")) {
      int eq = pair.indexOf('=');
      params.put(
          URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8),
          URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
    }
    return params;
  }
}
