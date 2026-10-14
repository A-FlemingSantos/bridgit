package com.bridgit.api.providers.dropbox;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

import com.bridgit.api.providers.CloudItem;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Random;
import com.bridgit.api.providers.ProviderApiException;
import org.springframework.http.HttpStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class DropboxUploadTest {

  private DropboxProviderClient client;
  private MockRestServiceServer server;

  @BeforeEach
  void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    client = new DropboxProviderClient(builder.build(), builder.build(), new ObjectMapper());
  }

  @Test
  void uploadSendsExactBytes() {
    byte[] data = binaryData(4096);
    server.expect(requestTo("https://content.dropboxapi.com/2/files/upload"))
        .andExpect(header("Dropbox-API-Arg", org.hamcrest.Matchers.containsString("/notes.bin")))
        .andExpect(content().bytes(data))
        .andRespond(withSuccess(itemJson("id:up1", "notes.bin", 4096), MediaType.APPLICATION_JSON));

    CloudItem item = client.upload("token", null, "notes.bin", "application/octet-stream", data.length,
        new ByteArrayResource(data));

    assertEquals("id:up1", item.ref());
    server.verify();
  }

  @Test
  void uploadEmptyFile() {
    byte[] data = new byte[0];
    server.expect(requestTo("https://content.dropboxapi.com/2/files/upload"))
        .andExpect(content().bytes(data))
        .andRespond(withSuccess(itemJson("id:up2", "empty.txt", 0), MediaType.APPLICATION_JSON));

    client.upload("token", null, "empty.txt", "text/plain", 0, new ByteArrayResource(data));
    server.verify();
  }

  @Test
  void uploadUsesCompactAsciiOnlyApiArgumentHeader() {
    byte[] data = new byte[] {1};
    server.expect(requestTo("https://content.dropboxapi.com/2/files/upload"))
        .andExpect(request -> {
          String apiArg = request.getHeaders().getFirst("Dropbox-API-Arg");
          assertTrue(apiArg.chars().allMatch(ch -> ch >= 0x20 && ch <= 0x7e));
          assertTrue(apiArg.contains("\\u007f"));
          assertTrue(apiArg.contains("\\u00e9"));
          assertTrue(!apiArg.contains("\n") && !apiArg.contains("\r"));
        })
        .andRespond(withSuccess(itemJson("id:up3", "café.bin", 1), MediaType.APPLICATION_JSON));

    client.upload("token", null, "café\u007f.bin", "application/octet-stream", data.length,
        new ByteArrayResource(data));
    server.verify();
  }

  @Test
  void upload413MapsToFileTooLarge() {
    server.expect(requestTo("https://content.dropboxapi.com/2/files/upload"))
        .andRespond(withStatus(HttpStatus.PAYLOAD_TOO_LARGE).body(""));

    ProviderApiException ex = assertThrows(ProviderApiException.class, () -> client.upload(
        "token", null, "big.bin", "application/octet-stream", 1, new ByteArrayResource(new byte[] {1})));

    assertEquals("ARQUIVO_GRANDE_DEMAIS", ex.getCode());
    assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, ex.getStatus());
    server.verify();
  }

  @Test
  void uploadInsufficientSpaceMapsToNoSpaceCode() {
    server.expect(requestTo("https://content.dropboxapi.com/2/files/upload"))
        .andRespond(withStatus(HttpStatus.CONFLICT).body(
            "{\"error_summary\":\"path/insufficient_space/..\",\"error\":{\".tag\":\"path\","
                + "\"path\":{\".tag\":\"insufficient_space\"}}}"));

    ProviderApiException ex = assertThrows(ProviderApiException.class, () -> client.upload(
        "token", null, "a.bin", "application/octet-stream", 1, new ByteArrayResource(new byte[] {1})));

    assertEquals("PROVEDOR_SEM_ESPACO", ex.getCode());
    assertEquals(HttpStatus.INSUFFICIENT_STORAGE, ex.getStatus());
    server.verify();
  }

  @Test
  void uploadMalformedPathMapsToInvalidName() {
    server.expect(requestTo("https://content.dropboxapi.com/2/files/upload"))
        .andRespond(withStatus(HttpStatus.CONFLICT).body("{\"error_summary\":\"path/malformed_path/..\"}"));

    ProviderApiException ex = assertThrows(ProviderApiException.class, () -> client.upload(
        "token", null, "a.bin", "application/octet-stream", 1, new ByteArrayResource(new byte[] {1})));

    assertEquals("NOME_INVALIDO", ex.getCode());
    assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus());
    server.verify();
  }

  private static byte[] binaryData(int size) {
    byte[] data = new byte[size];
    new Random(13).nextBytes(data);
    return data;
  }

  private static String itemJson(String id, String name, long size) {
    return """
        {".tag":"file","id":"%s","name":"%s","size":%d,"path_display":"/%s"}
        """.formatted(id, name, size, name);
  }
}
