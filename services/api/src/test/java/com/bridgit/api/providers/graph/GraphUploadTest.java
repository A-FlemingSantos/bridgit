package com.bridgit.api.providers.graph;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.bridgit.api.providers.CloudItem;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.match.MockRestRequestMatchers;
import org.springframework.web.client.RestClient;

class GraphUploadTest {

  private static final long SIMPLE_MAX = 4L * 1024L * 1024L;

  private GraphProviderClient client;
  private MockRestServiceServer server;

  @BeforeEach
  void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    RestClient shared = builder.build();
    client = new GraphProviderClient(shared, shared, new ObjectMapper());
  }

  @Test
  void simpleUploadSendsExactBytes() {
    byte[] data = binaryData(1024);
    server.expect(requestTo("https://graph.microsoft.com/v1.0/me/drive/items/root:/backup.bin:/content"))
        .andExpect(MockRestRequestMatchers.method(HttpMethod.PUT))
        .andExpect(content().bytes(data))
        .andRespond(withSuccess(itemJson("up-1", "backup.bin"), MediaType.APPLICATION_JSON));

    CloudItem item = client.upload("token", null, "backup.bin", "application/octet-stream", data.length,
        new ByteArrayResource(data));

    assertEquals("up-1", item.ref());
    server.verify();
  }

  @Test
  void simpleUploadEmptyFile() {
    byte[] data = new byte[0];
    server.expect(requestTo("https://graph.microsoft.com/v1.0/me/drive/items/root:/empty.txt:/content"))
        .andExpect(content().bytes(data))
        .andRespond(withSuccess(itemJson("up-2", "empty.txt"), MediaType.APPLICATION_JSON));

    client.upload("token", null, "empty.txt", "text/plain", 0, new ByteArrayResource(data));
    server.verify();
  }

  @Test
  void simpleUploadAtExactly4MiB() {
    byte[] data = binaryData((int) SIMPLE_MAX);
    server.expect(requestTo("https://graph.microsoft.com/v1.0/me/drive/items/root:/edge.bin:/content"))
        .andExpect(content().bytes(data))
        .andRespond(withSuccess(itemJson("up-3", "edge.bin"), MediaType.APPLICATION_JSON));

    client.upload("token", null, "edge.bin", "application/octet-stream", data.length,
        new ByteArrayResource(data));
    server.verify();
  }

  @Test
  void sessionUploadAbove4MiBStreamsAllChunks() {
    byte[] data = binaryData((int) (SIMPLE_MAX + 10));
    server.expect(requestTo(org.hamcrest.Matchers.containsString("createUploadSession")))
        .andRespond(withSuccess("{\"uploadUrl\":\"https://upload.example/session\"}", MediaType.APPLICATION_JSON));

    int chunk = 320 * 1024;
    int chunks = (int) Math.ceil(data.length / (double) chunk);
    for (int i = 0; i < chunks - 1; i++) {
      byte[] expected = java.util.Arrays.copyOfRange(data, i * chunk, (i + 1) * chunk);
      server.expect(ExpectedCount.once(), requestTo("https://upload.example/session"))
          .andExpect(content().bytes(expected))
          .andRespond(withStatus(HttpStatus.ACCEPTED).body(new byte[0]));
    }
    byte[] last = java.util.Arrays.copyOfRange(data, (chunks - 1) * chunk, data.length);
    server.expect(ExpectedCount.once(), requestTo("https://upload.example/session"))
        .andExpect(content().bytes(last))
        .andRespond(withSuccess(itemJson("up-4", "big.bin"), MediaType.APPLICATION_JSON));

    CloudItem item = client.upload("token", null, "big.bin", "application/octet-stream", data.length,
        new ByteArrayResource(data));

    assertEquals("up-4", item.ref());
    server.verify();
  }

  private static byte[] binaryData(int size) {
    byte[] data = new byte[size];
    new Random(42).nextBytes(data);
    return data;
  }

  private static String itemJson(String id, String name) {
    return """
        {"id":"%s","name":"%s","size":10,"file":{"mimeType":"application/octet-stream"}}
        """.formatted(id, name);
  }
}
