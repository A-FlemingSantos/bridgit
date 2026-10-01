package com.bridgit.api.providers.drive;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.ItemKind;
import com.bridgit.api.providers.sync.PreparedWrite;
import com.bridgit.api.providers.sync.SyncPage;
import com.bridgit.api.providers.sync.SyncResetException;
import com.bridgit.api.providers.sync.WatchRegistration;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class GoogleDriveSyncTest {

  private GoogleDriveProviderClient client;
  private MockRestServiceServer server;

  @BeforeEach
  void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    client = new GoogleDriveProviderClient(builder.build(), new ObjectMapper());
  }

  @Test
  void inventoryCapturesTokenBeforePagingAndReplaysChangesBeforeCaughtUp() {
    server.expect(requestTo("https://www.googleapis.com/drive/v3/files/root?fields=id"))
        .andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/changes/startPageToken?")))
        .andRespond(withSuccess("{\"startPageToken\":\"changes-1\"}", MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.allOf(
            org.hamcrest.Matchers.containsString("/files?"),
            org.hamcrest.Matchers.containsString("corpora=user"),
            org.hamcrest.Matchers.containsString("q=trashed%3Dfalse"))))
        .andRespond(withSuccess("""
            {"nextPageToken":"files-2","files":[
              {"id":"f-1","name":"one.txt","mimeType":"text/plain","size":"2",
               "parents":["root-id"],"version":"7","md5Checksum":"hash"}
            ]}
            """, MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.containsString("pageToken=files-2")))
        .andRespond(withSuccess("{\"files\":[]}", MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.allOf(
            org.hamcrest.Matchers.containsString("/changes?pageToken=changes-1"),
            org.hamcrest.Matchers.containsString("includeRemoved=true"))))
        .andRespond(withSuccess("""
            {"newStartPageToken":"changes-2","changes":[
              {"fileId":"removed","removed":true},
              {"fileId":"partial","file":{"id":"partial","name":"partial.txt"}},
              {"fileId":"trashed","file":{"id":"trashed","trashed":true}}
            ]}
            """, MediaType.APPLICATION_JSON));

    SyncPage first = client.syncPage("token", null);

    assertFalse(first.caughtUp());
    assertEquals("root-id", first.rootRef());
    CloudItem item = first.changes().getFirst().item();
    assertEquals("7", item.remoteVersion());
    assertEquals("hash", item.contentRevision());

    SyncPage afterInventory = client.syncPage("token", first.checkpoint());

    assertFalse(afterInventory.caughtUp());
    SyncPage caughtUp = client.syncPage("token", afterInventory.checkpoint());

    assertTrue(caughtUp.caughtUp());
    assertTrue(caughtUp.changes().get(0).deleted());
    assertEquals("partial.txt", caughtUp.changes().get(1).item().name());
    assertEquals(java.util.Set.of("name", "extension"), caughtUp.changes().get(1).knownFields());
    assertTrue(caughtUp.changes().get(2).deleted());
    server.verify();
  }

  @Test
  void incompleteInventoryAndExpiredChangeTokenRequireReset() {
    server.expect(requestTo("https://www.googleapis.com/drive/v3/files/root?fields=id"))
        .andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/changes/startPageToken?")))
        .andRespond(withSuccess("{\"startPageToken\":\"changes-1\"}", MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/files?")))
        .andRespond(withSuccess("{\"incompleteSearch\":true,\"files\":[]}", MediaType.APPLICATION_JSON));

    assertThrows(SyncResetException.class, () -> client.syncPage("token", null));
    server.verify();
  }

  @Test
  void preparedIdsAreWrittenForFoldersAndUploads() {
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/files/generateIds?")))
        .andRespond(withSuccess("{\"ids\":[\"reserved-folder\"]}", MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/files?fields=")))
        .andExpect(content().string(org.hamcrest.Matchers.containsString("\"id\":\"reserved-folder\"")))
        .andRespond(withSuccess("""
            {"id":"reserved-folder","name":"Folder","mimeType":"application/vnd.google-apps.folder",
             "version":"10"}
            """, MediaType.APPLICATION_JSON));

    PreparedWrite prepared = client.prepareCreate("token");
    CloudItem folder = client.createFolderPrepared("token", "parent", "Folder", prepared);

    assertEquals("reserved-folder", folder.ref());
    assertEquals("10", folder.remoteVersion());
    server.verify();
  }

  @Test
  void preparedUploadIncludesItsReservedIdInMultipartMetadata() {
    server.expect(requestTo(org.hamcrest.Matchers.containsString("uploadType=multipart")))
        .andExpect(content().string(org.hamcrest.Matchers.containsString("\"id\":\"reserved-file\"")))
        .andRespond(withSuccess("""
            {"id":"reserved-file","name":"file.txt","mimeType":"text/plain","size":"1",
             "version":"11","sha256Checksum":"content-hash"}
            """, MediaType.APPLICATION_JSON));

    CloudItem file = client.uploadPrepared("token", "parent", "file.txt", "text/plain", 1,
        new ByteArrayResource(new byte[] {1}), new PreparedWrite("reserved-file", null));

    assertEquals("reserved-file", file.ref());
    assertEquals("content-hash", file.contentRevision());
    server.verify();
  }

  @Test
  void replacesExistingWatchChannelAfterCreatingTheNewOne() {
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/changes/startPageToken?")))
        .andRespond(withSuccess("{\"startPageToken\":\"changes-1\"}", MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/changes/watch?pageToken=changes-1")))
        .andExpect(content().string(org.hamcrest.Matchers.allOf(
            org.hamcrest.Matchers.containsString("\"type\":\"web_hook\""),
            org.hamcrest.Matchers.containsString("\"token\":\"state\""))))
        .andRespond(withSuccess("{\"resourceId\":\"new-resource\",\"expiration\":\"1770000000000\"}",
            MediaType.APPLICATION_JSON));
    server.expect(requestTo("https://www.googleapis.com/drive/v3/channels/stop"))
        .andExpect(content().string(org.hamcrest.Matchers.containsString("old-resource")))
        .andRespond(withStatus(org.springframework.http.HttpStatus.NO_CONTENT));

    WatchRegistration registration = client.watch("token", "https://callback.test/drive", "state",
        new WatchRegistration("old-channel", "old-resource", Instant.now()));

    assertEquals("new-resource", registration.resourceId());
    assertEquals(Instant.ofEpochMilli(1770000000000L), registration.expiresAt());
    server.verify();
  }
}
