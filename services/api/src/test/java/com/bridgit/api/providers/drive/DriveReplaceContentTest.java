package com.bridgit.api.providers.drive;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
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
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class DriveReplaceContentTest {

  private static final byte[] DATA = "hello world".getBytes(StandardCharsets.UTF_8);
  private static final String VERSION_URL = "https://www.googleapis.com/drive/v3/files/file-1?fields=";
  private static final String UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files/file-1?uploadType=media";

  private GoogleDriveProviderClient client;
  private MockRestServiceServer server;

  @BeforeEach
  void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    client = new GoogleDriveProviderClient(builder.build(), new ObjectMapper());
  }

  private void expectVersionRead(String body) {
    server.expect(requestTo(Matchers.allOf(Matchers.startsWith(VERSION_URL),
            Matchers.containsString("headRevisionId"), Matchers.containsString("supportsAllDrives=true"))))
        .andExpect(method(HttpMethod.GET))
        .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
  }

  @Test
  void comparesVersionThenPatchesMedia() {
    expectVersionRead("{\"id\":\"file-1\",\"headRevisionId\":\"rev-1\",\"modifiedTime\":\"2026-01-01T00:00:00Z\"}");
    server.expect(requestTo(Matchers.allOf(Matchers.startsWith(UPLOAD_URL),
            Matchers.containsString("supportsAllDrives=true"), Matchers.containsString("fields="))))
        .andExpect(method(HttpMethod.PATCH))
        .andExpect(header("Content-Type", "text/plain"))
        .andExpect(content().bytes(DATA))
        .andRespond(withSuccess("{\"id\":\"file-1\",\"name\":\"a.txt\",\"mimeType\":\"text/plain\",\"size\":\"11\",\"headRevisionId\":\"rev-2\"}",
            MediaType.APPLICATION_JSON));

    CloudItem item = client.replaceContent("token", "file-1", "text/plain", DATA.length,
        new ByteArrayResource(DATA), "rev-1");

    assertEquals("rev-2", item.contentRevision());
    assertFalse(item.parentKnown());
    server.verify();
  }

  @Test
  void versionMismatchStopsBeforeWriting() {
    expectVersionRead("{\"id\":\"file-1\",\"headRevisionId\":\"rev-9\"}");

    ProviderApiException ex = assertThrows(ProviderApiException.class, () -> client.replaceContent("token",
        "file-1", "text/plain", DATA.length, new ByteArrayResource(DATA), "rev-1"));

    assertEquals("ARQUIVO_ALTERADO", ex.getCode());
    server.verify();
  }

  @Test
  void trashedFileIsNotFound() {
    expectVersionRead("{\"id\":\"file-1\",\"headRevisionId\":\"rev-1\",\"trashed\":true}");

    ProviderApiException ex = assertThrows(ProviderApiException.class, () -> client.replaceContent("token",
        "file-1", "text/plain", DATA.length, new ByteArrayResource(DATA), "rev-1"));

    assertEquals(HttpStatus.NOT_FOUND, ex.getStatus());
    server.verify();
  }

  @Test
  void withoutVersionWritesDirectly() {
    server.expect(requestTo(Matchers.startsWith(UPLOAD_URL)))
        .andRespond(withSuccess("{\"id\":\"file-1\",\"name\":\"a.txt\",\"mimeType\":\"text/plain\",\"headRevisionId\":\"rev-2\"}",
            MediaType.APPLICATION_JSON));

    client.replaceContent("token", "file-1", "text/plain", DATA.length, new ByteArrayResource(DATA), null);
    server.verify();
  }

  @Test
  void writeErrorUsesWriteMapping() {
    server.expect(requestTo(Matchers.startsWith(UPLOAD_URL))).andRespond(withStatus(HttpStatus.PAYLOAD_TOO_LARGE));

    ProviderApiException ex = assertThrows(ProviderApiException.class, () -> client.replaceContent("token",
        "file-1", "text/plain", DATA.length, new ByteArrayResource(DATA), null));
    assertEquals("ARQUIVO_GRANDE_DEMAIS", ex.getCode());
  }
}
