package com.bridgit.api.providers.drive;

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
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class DriveRangeTest {

  private GoogleDriveProviderClient client;
  private MockRestServiceServer server;

  @BeforeEach
  void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    client = new GoogleDriveProviderClient(builder.build(), new ObjectMapper());
  }

  private static CloudItem item(long size) {
    return new CloudItem("file-1", "google-drive", "file.bin", ItemKind.FILE,
        "application/octet-stream", "bin", size, OffsetDateTime.now(), null, true);
  }

  @Test
  void forwardsRangeToMediaEndpoint() throws Exception {
    byte[] slice = "0123456789".getBytes();
    server.expect(requestTo(org.hamcrest.Matchers.containsString("alt=media")))
        .andExpect(header(HttpHeaders.RANGE, "bytes=0-9"))
        .andRespond(withStatus(HttpStatus.PARTIAL_CONTENT)
            .header(HttpHeaders.CONTENT_RANGE, "bytes 0-9/100")
            .header(HttpHeaders.CONTENT_LENGTH, "10")
            .body(slice));

    ContentStream stream = client.open("token", item(100), ContentVariant.ORIGINAL,
        new ContentRange(0, 9L));

    assertEquals(206, stream.status());
    assertEquals("bytes 0-9/100", stream.contentRange());
    assertArrayEquals(slice, stream.body().readAllBytes());
    stream.close();
    server.verify();
  }

  @Test
  void relaysProvider416() {
    server.expect(requestTo(org.hamcrest.Matchers.containsString("alt=media")))
        .andRespond(withStatus(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            .header(HttpHeaders.CONTENT_RANGE, "bytes */100")
            .body(""));

    ContentStream stream = client.open("token", item(100), ContentVariant.ORIGINAL,
        new ContentRange(0, 9L));

    assertEquals(416, stream.status());
    assertEquals("bytes */100", stream.contentRange());
    server.verify();
  }

  @Test
  void unsatisfiableRangeShortCircuits() {
    ContentStream stream = client.open("token", item(50), ContentVariant.ORIGINAL,
        new ContentRange(60, null));

    assertEquals(416, stream.status());
    assertEquals("bytes */50", stream.contentRange());
    server.verify();
  }

  @Test
  void exportNeverAdvertisesPartial() throws Exception {
    byte[] pdf = "%pdf".getBytes();
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/export?")))
        .andRespond(withSuccess(pdf, MediaType.APPLICATION_PDF));

    CloudItem nativeDoc = new CloudItem("doc-1", "google-drive", "Notes", ItemKind.FILE,
        "application/vnd.google-apps.document", null, null, OffsetDateTime.now(), null, true);
    ContentStream stream = client.open("token", nativeDoc, ContentVariant.READ,
        new ContentRange(0, 9L));

    assertEquals(200, stream.status());
    assertNull(stream.contentRange());
    stream.close();
    server.verify();
  }
}
