package com.bridgit.api.providers.dropbox;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.bridgit.api.providers.sync.SyncResetException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class DropboxSyncTest {

  private DropboxProviderClient client;
  private MockRestServiceServer server;

  @BeforeEach
  void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    client = new DropboxProviderClient(builder.build(), builder.build(), new ObjectMapper());
  }

  @Test
  void bootstrapRecursivelyListsMountedFoldersAndKeepsTheCursor() {
    server.expect(requestTo("https://api.dropboxapi.com/2/files/list_folder"))
        .andExpect(jsonPath("$.path").value(""))
        .andExpect(jsonPath("$.recursive").value(true))
        .andExpect(jsonPath("$.include_deleted").value(true))
        .andExpect(jsonPath("$.include_mounted_folders").value(true))
        .andRespond(withSuccess("""
            {"entries":[
              {".tag":"folder","id":"id:docs","name":"Docs","path_display":"/Docs"},
              {".tag":"file","id":"id:guide","name":"guide.txt","path_display":"/Docs/guide.txt",
               "size":12,"rev":"a1","content_hash":"hash1","client_modified":"2026-01-01T00:00:00Z"}
            ],"cursor":"cursor-1","has_more":true}
            """, MediaType.APPLICATION_JSON));

    var page = client.syncPage("token", null);

    assertFalse(page.caughtUp());
    assertEquals("cursor-1", page.checkpoint());
    assertNull(page.rootRef());
    assertEquals("id:docs", page.changes().get(0).ref());
    assertEquals("/Docs", page.changes().get(0).path());
    assertEquals("/Docs", page.changes().get(1).parentPath());
    assertFalse(page.changes().get(1).item().parentKnown());
    assertEquals("a1", page.changes().get(1).item().remoteVersion());
    assertEquals("hash1", page.changes().get(1).item().contentRevision());
    server.verify();
  }

  @Test
  void continuationRetainsFinalCursorAndRepresentsPathOnlyDeletion() {
    server.expect(requestTo("https://api.dropboxapi.com/2/files/list_folder/continue"))
        .andExpect(jsonPath("$.cursor").value("cursor-1"))
        .andRespond(withSuccess("""
            {"entries":[{".tag":"deleted","name":"guide.txt","path_lower":"/docs/guide.txt",
              "path_display":"/Docs/guide.txt"}],"cursor":"cursor-2","has_more":false}
            """, MediaType.APPLICATION_JSON));

    var page = client.syncPage("token", "cursor-1");

    assertTrue(page.caughtUp());
    assertEquals("cursor-2", page.checkpoint());
    var removed = page.changes().getFirst();
    assertTrue(removed.deleted());
    assertNull(removed.ref());
    assertNull(removed.item());
    assertEquals("/Docs/guide.txt", removed.path());
    assertEquals("/Docs", removed.parentPath());
    server.verify();
  }

  @Test
  void resetContinuationRequiresAFullInventory() {
    server.expect(requestTo("https://api.dropboxapi.com/2/files/list_folder/continue"))
        .andRespond(withStatus(HttpStatus.CONFLICT)
            .contentType(MediaType.APPLICATION_JSON)
            .body("{\"error_summary\":\"reset/..\",\"error\":{\".tag\":\"reset\"}}"));

    assertThrows(SyncResetException.class, () -> client.syncPage("token", "expired-cursor"));
    server.verify();
  }
}
