package com.bridgit.api.providers.drive;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.bridgit.api.providers.CloudItem;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class DriveUploadTest {

  private GoogleDriveProviderClient client;
  private MockRestServiceServer server;

  @BeforeEach
  void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    client = new GoogleDriveProviderClient(builder.build(), new ObjectMapper());
  }

  @Test
  void multipartUploadStreamsFileBytesWithoutLoadingTwice() {
    server.expect(requestTo("https://www.googleapis.com/drive/v3/files/root?fields=id"))
        .andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));

    byte[] data = binaryData(2048);
    server.expect(requestTo(org.hamcrest.Matchers.containsString("uploadType=multipart")))
        .andExpect(request -> {
          byte[] body = ((MockClientHttpRequest) request).getBodyAsBytes();
          assertTrue(contains(body, data), "multipart body must carry the exact file bytes");
          String text = new String(body, StandardCharsets.UTF_8);
          assertTrue(text.contains("root-id"));
        })
        .andRespond(withSuccess(itemJson("up-1", "doc.bin"), MediaType.APPLICATION_JSON));

    CloudItem item = client.upload("token", null, "doc.bin", "application/octet-stream", data.length,
        new ByteArrayResource(data));

    assertEquals("up-1", item.ref());
    server.verify();
  }

  @Test
  void multipartUploadEmptyFile() {
    server.expect(requestTo("https://www.googleapis.com/drive/v3/files/root?fields=id"))
        .andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));

    server.expect(requestTo(org.hamcrest.Matchers.containsString("uploadType=multipart")))
        .andRespond(withSuccess(itemJson("up-2", "empty.txt"), MediaType.APPLICATION_JSON));

    client.upload("token", null, "empty.txt", "text/plain", 0, new ByteArrayResource(new byte[0]));
    server.verify();
  }

  @Test
  void multipartUploadAtExactly5MiB() {
    server.expect(requestTo("https://www.googleapis.com/drive/v3/files/root?fields=id"))
        .andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));

    byte[] data = binaryData((int) GoogleDriveProviderClient.MULTIPART_MAX);
    server.expect(requestTo(org.hamcrest.Matchers.containsString("uploadType=multipart")))
        .andExpect(request -> assertTrue(
            contains(((MockClientHttpRequest) request).getBodyAsBytes(), data)))
        .andRespond(withSuccess(itemJson("up-3", "edge.bin"), MediaType.APPLICATION_JSON));

    client.upload("token", null, "edge.bin", "application/octet-stream", data.length,
        new ByteArrayResource(data));
    server.verify();
  }

  @Test
  void resumableUploadAbove5MiBSendsExactBytes() {
    server.expect(requestTo("https://www.googleapis.com/drive/v3/files/root?fields=id"))
        .andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));

    server.expect(requestTo(org.hamcrest.Matchers.containsString("uploadType=resumable")))
        .andRespond(withStatus(HttpStatus.OK)
            .header(HttpHeaders.LOCATION, "https://upload.example/resumable-session")
            .body("{}"));

    byte[] data = binaryData((int) (GoogleDriveProviderClient.MULTIPART_MAX + 7));
    server.expect(requestTo("https://upload.example/resumable-session"))
        .andExpect(content().bytes(data))
        .andRespond(withSuccess(itemJson("up-4", "big.bin"), MediaType.APPLICATION_JSON));

    CloudItem item = client.upload("token", null, "big.bin", "application/octet-stream", data.length,
        new ByteArrayResource(data));

    assertEquals("up-4", item.ref());
    server.verify();
  }

  private static byte[] binaryData(int size) {
    byte[] data = new byte[size];
    new Random(7).nextBytes(data);
    return data;
  }

  private static boolean contains(byte[] haystack, byte[] needle) {
    if (needle.length == 0) {
      return true;
    }
    outer:
    for (int i = 0; i + needle.length <= haystack.length; i++) {
      for (int j = 0; j < needle.length; j++) {
        if (haystack[i + j] != needle[j]) {
          continue outer;
        }
      }
      return true;
    }
    return false;
  }

  private static String itemJson(String id, String name) {
    return """
        {"id":"%s","name":"%s","mimeType":"application/octet-stream","size":"10"}
        """.formatted(id, name);
  }
}
