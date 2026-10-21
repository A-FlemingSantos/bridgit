package com.bridgit.api.providers.dropbox;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.ContentStream;
import com.bridgit.api.providers.ItemKind;
import com.bridgit.api.providers.ItemPage;
import com.bridgit.api.providers.ProviderApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class DropboxProviderClientTest {

  private DropboxProviderClient client;
  private MockRestServiceServer server;

  @BeforeEach
  void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    client = new DropboxProviderClient(builder.build(), builder.build(), new ObjectMapper());
  }

  @Test
  void listRootMapsEntriesAndCursor() {
    server.expect(requestTo("https://api.dropboxapi.com/2/files/list_folder"))
        .andRespond(withSuccess("""
            {
              "entries": [
                {
                  ".tag": "folder",
                  "id": "id:folder1",
                  "name": "Docs",
                  "path_display": "/Docs"
                },
                {
                  ".tag": "file",
              "id": "id:file1",
              "name": "notes.txt",
              "size": 42,
              "rev": "015f",
              "content_hash": "2a9b",
              "path_display": "/notes.txt",
                  "client_modified": "2026-01-01T00:00:00Z"
                }
              ],
              "has_more": true,
              "cursor": "cursor-1"
            }
            """, MediaType.APPLICATION_JSON));

    ItemPage page = client.list("token", null, null);

    assertEquals(2, page.items().size());
    assertEquals(ItemKind.FOLDER, page.items().get(0).kind());
    assertEquals("id:folder1", page.items().get(0).ref());
    assertEquals("015f", page.items().get(1).remoteVersion());
    assertEquals("2a9b", page.items().get(1).contentRevision());
    assertEquals("cursor-1", page.nextCursor());
    server.verify();
  }

  @Test
  void listTreatsInvalidClientModifiedAsMissing() {
    server.expect(requestTo("https://api.dropboxapi.com/2/files/list_folder"))
        .andRespond(withSuccess("""
            {
              "entries": [
                {".tag": "file", "id": "id:f1", "name": "bad.txt", "size": 1,
                 "path_display": "/bad.txt", "client_modified": "not-a-date"},
                {".tag": "file", "id": "id:f2", "name": "ok.txt", "size": 1,
                 "path_display": "/ok.txt", "client_modified": "2026-01-01T00:00:00Z"}
              ],
              "has_more": false
            }
            """, MediaType.APPLICATION_JSON));

    ItemPage page = client.list("token", null, null);

    assertEquals(2, page.items().size());
    assertNull(page.items().get(0).modifiedAt());
    assertNotNull(page.items().get(1).modifiedAt());
    server.verify();
  }

  @Test
  void continueUsesCursor() {
    server.expect(requestTo("https://api.dropboxapi.com/2/files/list_folder/continue"))
        .andRespond(withSuccess("""
            {"entries": [], "has_more": false}
            """, MediaType.APPLICATION_JSON));

    client.list("token", null, "cursor-1");
    server.verify();
  }

  @Test
  void createFolderMapsConcreteMetadataWithoutTagAsFolder() {
    server.expect(requestTo("https://api.dropboxapi.com/2/files/create_folder_v2"))
        .andRespond(withSuccess("""
            {"metadata":{"id":"id:folder2","name":"Archive","path_display":"/Archive","rev":"3a"}}
            """, MediaType.APPLICATION_JSON));

    var folder = client.createFolder("token", null, "Archive");

    assertEquals(ItemKind.FOLDER, folder.kind());
    assertEquals("3a", folder.remoteVersion());
    server.verify();
  }

  @Test
  void thumbnailRequestsAStrictFit() throws Exception {
    server.expect(requestTo("https://content.dropboxapi.com/2/files/get_thumbnail_v2"))
        .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer token"))
        .andExpect(header("Dropbox-API-Arg", org.hamcrest.Matchers.allOf(
            org.hamcrest.Matchers.containsString("\"mode\":\"strict\""),
            org.hamcrest.Matchers.containsString("\"size\":\"w640h480\""),
            org.hamcrest.Matchers.containsString("id:photo")
        )))
        .andRespond(withSuccess(new byte[] {1}, MediaType.IMAGE_JPEG));

    ContentStream stream = client.openThumbnail("token", new CloudItem(
        "id:photo", "dropbox", "a.jpg", ItemKind.FILE, "image/jpeg", "jpg", 4L, null, null
    ));

    assertEquals(1, stream.body().read());
    stream.close();
    server.verify();
  }

  @Test
  void officeAndPdfThumbnailsAreUnavailableWithoutARequest() {
    CloudItem pdf = new CloudItem("id:pdf", "dropbox", "a.pdf", ItemKind.FILE, "application/pdf", "pdf", 4L, null, null);
    CloudItem docx = new CloudItem(
        "id:doc", "dropbox", "a.docx", ItemKind.FILE,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx", 4L, null, null
    );

    ProviderApiException pdfError = assertThrows(ProviderApiException.class, () -> client.openThumbnail("token", pdf));
    ProviderApiException docxError = assertThrows(ProviderApiException.class, () -> client.openThumbnail("token", docx));

    assertEquals(HttpStatus.NOT_FOUND, pdfError.getStatus());
    assertEquals(HttpStatus.NOT_FOUND, docxError.getStatus());
    server.verify();
  }
}
