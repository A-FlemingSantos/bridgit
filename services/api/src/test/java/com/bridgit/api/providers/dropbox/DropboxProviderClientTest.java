package com.bridgit.api.providers.dropbox;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.bridgit.api.providers.ItemKind;
import com.bridgit.api.providers.ItemPage;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
}
