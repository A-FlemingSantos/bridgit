package com.bridgit.api.providers.graph;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.ContentRange;
import com.bridgit.api.providers.ContentStream;
import com.bridgit.api.providers.ContentVariant;
import com.bridgit.api.providers.ItemKind;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class GraphRangeTest {

  private GraphProviderClient client;
  private MockRestServiceServer server;

  @BeforeEach
  void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    RestClient shared = builder.build();
    client = new GraphProviderClient(shared, shared, new ObjectMapper());
  }

  private static CloudItem item(long size) {
    return new CloudItem("item-1", "onedrive", "file.bin", ItemKind.FILE,
        "application/octet-stream", "bin", size, OffsetDateTime.now(), null, true);
  }

  @Test
  void forwardsRangeToRedirectLocationAndParses206() throws Exception {
    byte[] slice = "0123456789".getBytes();
    server.expect(ExpectedCount.once(), requestTo("https://graph.microsoft.com/v1.0/me/drive/items/item-1/content"))
        .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer token"))
        .andExpect(header(HttpHeaders.RANGE, "bytes=0-9"))
        .andRespond(withStatus(HttpStatus.FOUND)
            .header(HttpHeaders.LOCATION, "https://download.example.com/file")
            .body(""));

    server.expect(ExpectedCount.once(), requestTo("https://download.example.com/file"))
        .andExpect(header(HttpHeaders.RANGE, "bytes=0-9"))
        .andRespond(withStatus(HttpStatus.PARTIAL_CONTENT)
            .header(HttpHeaders.CONTENT_RANGE, "bytes 0-9/100")
            .header(HttpHeaders.CONTENT_LENGTH, "10")
            .body(slice));

    ContentStream stream = client.open("token", item(100), ContentVariant.ORIGINAL,
        new ContentRange(0, 9L));

    assertEquals(206, stream.status());
    assertEquals("bytes 0-9/100", stream.contentRange());
    assertEquals(10L, stream.contentLength());
    assertEquals(100L, stream.totalSize());
    assertArrayEquals(slice, stream.body().readAllBytes());
    stream.close();
    server.verify();
  }

  @Test
  void providerIgnoringRangeFallsBackToFull200() throws Exception {
    byte[] full = "full-content".getBytes();
    server.expect(ExpectedCount.once(), requestTo("https://graph.microsoft.com/v1.0/me/drive/items/item-1/content"))
        .andRespond(withStatus(HttpStatus.FOUND)
            .header(HttpHeaders.LOCATION, "https://download.example.com/file")
            .body(""));
    server.expect(ExpectedCount.once(), requestTo("https://download.example.com/file"))
        .andRespond(withSuccess(full, MediaType.APPLICATION_OCTET_STREAM));

    ContentStream stream = client.open("token", item(100), ContentVariant.ORIGINAL,
        new ContentRange(0, 9L));

    assertEquals(200, stream.status());
    assertNull(stream.contentRange());
    assertArrayEquals(full, stream.body().readAllBytes());
    stream.close();
    server.verify();
  }

  @Test
  void unsatisfiableRangeShortCircuitsWithoutNetworkCall() {
    ContentStream stream = client.open("token", item(100), ContentVariant.ORIGINAL,
        new ContentRange(500, 509L));

    assertEquals(416, stream.status());
    assertEquals("bytes */100", stream.contentRange());
    server.verify();
  }

  @Test
  void readVariantNeverForwardsRange() throws Exception {
    byte[] pdf = "%pdf".getBytes();
    server.expect(ExpectedCount.once(),
        requestTo(org.hamcrest.Matchers.containsString("format=pdf")))
        .andRespond(withStatus(HttpStatus.FOUND)
            .header(HttpHeaders.LOCATION, "https://download.example.com/read")
            .body(""));
    server.expect(ExpectedCount.once(), requestTo("https://download.example.com/read"))
        .andRespond(withSuccess(pdf, MediaType.APPLICATION_PDF));

    ContentStream stream = client.open("token", item(100), ContentVariant.READ,
        new ContentRange(0, 9L));

    assertEquals(200, stream.status());
    assertNull(stream.contentRange());
    stream.close();
    server.verify();
  }
}
