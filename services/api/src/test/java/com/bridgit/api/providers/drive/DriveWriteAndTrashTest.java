package com.bridgit.api.providers.drive;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.ContentVariant;
import com.bridgit.api.providers.ProviderApiException;
import com.bridgit.api.providers.sync.SyncPage;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;

class DriveWriteAndTrashTest {

  private static final String ROOT = "https://www.googleapis.com/drive/v3/files/root?fields=id";

  private GoogleDriveProviderClient client;
  private MockRestServiceServer server;

  @BeforeEach
  void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    client = new GoogleDriveProviderClient(builder.build(), new ObjectMapper());
  }

  @Test
  void versionFollowsTheContentNotDrivesInternalCounter() {
    server.expect(requestTo(containsString("/files/bin?"))).andRespond(withSuccess("""
        {"id":"bin","name":"a.docx","mimeType":"application/octet-stream","parents":["root-id"],
         "version":"3","headRevisionId":"rev-1","md5Checksum":"md5","modifiedTime":"2026-01-01T00:00:00Z"}
        """, MediaType.APPLICATION_JSON));
    server.expect(requestTo(ROOT)).andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));
    server.expect(requestTo(containsString("/files/doc?"))).andRespond(withSuccess("""
        {"id":"doc","name":"Notas","mimeType":"application/vnd.google-apps.document","parents":["root-id"],
         "version":"9","modifiedTime":"2026-02-01T00:00:00Z"}
        """, MediaType.APPLICATION_JSON));

    assertEquals("rev-1", client.get("token", "bin").remoteVersion());
    // A native Google file has no revision or checksum; its modification time stands in.
    assertEquals("2026-02-01T00:00:00Z", client.get("token", "doc").remoteVersion());
    server.verify();
  }

  @Test
  void rootIdIsAskedOncePerToken() {
    server.expect(requestTo(containsString("/files/a?"))).andRespond(withSuccess(
        "{\"id\":\"a\",\"name\":\"a.txt\",\"mimeType\":\"text/plain\",\"parents\":[\"root-id\"]}",
        MediaType.APPLICATION_JSON));
    server.expect(requestTo(ROOT)).andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));
    server.expect(requestTo(containsString("/files/b?"))).andRespond(withSuccess(
        "{\"id\":\"b\",\"name\":\"b.txt\",\"mimeType\":\"text/plain\",\"parents\":[\"root-id\"]}",
        MediaType.APPLICATION_JSON));

    client.get("token", "a");
    CloudItem second = client.get("token", "b");

    assertEquals(null, second.parentRef());
    server.verify();
  }

  @Test
  void trashedItemIsNotFound() {
    server.expect(requestTo(containsString("/files/gone?"))).andRespond(withSuccess(
        "{\"id\":\"gone\",\"name\":\"PDFs\",\"mimeType\":\"application/vnd.google-apps.folder\","
            + "\"parents\":[\"root-id\"],\"trashed\":true}",
        MediaType.APPLICATION_JSON));

    ProviderApiException ex = assertThrows(ProviderApiException.class, () -> client.get("token", "gone"));

    assertEquals(HttpStatus.NOT_FOUND, ex.getStatus());
    assertEquals("ITEM_NAO_ENCONTRADO", ex.getCode());
    server.verify();
  }

  @Test
  void renameSendsTheNameAsJson() {
    server.expect(requestTo(allOf(containsString("/files/f-1?"), not(containsString("addParents")))))
        .andExpect(method(HttpMethod.PATCH))
        .andExpect(content().json("{\"name\":\"linha 1\\nlinha \\\"2\\\"\"}"))
        .andRespond(withSuccess(
            "{\"id\":\"f-1\",\"name\":\"linha 1\\nlinha \\\"2\\\"\",\"mimeType\":\"text/plain\",\"parents\":[\"p\"]}",
            MediaType.APPLICATION_JSON));
    server.expect(requestTo(ROOT)).andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));

    CloudItem renamed = client.update("token", "f-1", "linha 1\nlinha \"2\"", null);

    assertEquals("linha 1\nlinha \"2\"", renamed.name());
    server.verify();
  }

  @Test
  void moveOutOfTheRootRemovesTheRootParent() {
    server.expect(requestTo(containsString("/files/f-1?fields=parents%2Ctrashed")))
        .andRespond(withSuccess("{\"parents\":[\"root-id\"]}", MediaType.APPLICATION_JSON));
    server.expect(requestTo(allOf(
            containsString("/files/f-1?"),
            containsString("addParents=target"),
            containsString("removeParents=root-id"))))
        .andExpect(method(HttpMethod.PATCH))
        .andRespond(withSuccess(
            "{\"id\":\"f-1\",\"name\":\"a.txt\",\"mimeType\":\"text/plain\",\"parents\":[\"target\"]}",
            MediaType.APPLICATION_JSON));

    CloudItem moved = client.update("token", "f-1", null, "target");

    assertEquals("target", moved.parentRef());
    server.verify();
  }

  @Test
  void moveRemovesEveryCurrentParent() {
    server.expect(requestTo(ROOT)).andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));
    server.expect(requestTo(containsString("/files/f-1?fields=parents%2Ctrashed")))
        .andRespond(withSuccess("{\"parents\":[\"p-1\",\"p-2\"]}", MediaType.APPLICATION_JSON));
    server.expect(requestTo(allOf(containsString("addParents=root-id"), containsString("removeParents=p-1%2Cp-2"))))
        .andRespond(withSuccess(
            "{\"id\":\"f-1\",\"name\":\"a.txt\",\"mimeType\":\"text/plain\",\"parents\":[\"root-id\"]}",
            MediaType.APPLICATION_JSON));

    CloudItem moved = client.update("token", "f-1", null, "");

    assertEquals(null, moved.parentRef());
    server.verify();
  }

  @Test
  void moveOfATrashedItemIsNotFound() {
    server.expect(requestTo(containsString("/files/f-1?fields=parents%2Ctrashed")))
        .andRespond(withSuccess("{\"parents\":[\"p-1\"],\"trashed\":true}", MediaType.APPLICATION_JSON));

    ProviderApiException ex = assertThrows(ProviderApiException.class,
        () -> client.update("token", "f-1", null, "target"));

    assertEquals(HttpStatus.NOT_FOUND, ex.getStatus());
    server.verify();
  }

  @Test
  void deleteMovesToTheTrash() {
    server.expect(requestTo(containsString("/files/f-1?supportsAllDrives=true")))
        .andExpect(method(HttpMethod.PATCH))
        .andExpect(content().json("{\"trashed\":true}"))
        .andRespond(withSuccess("{\"id\":\"f-1\"}", MediaType.APPLICATION_JSON));

    client.delete("token", "f-1");

    server.verify();
  }

  @Test
  void refsAreEncodedInThePath() {
    server.expect(requestTo(containsString("/files/a%2Fb%3Fc?fields=")))
        .andRespond(withSuccess(
            "{\"id\":\"a/b?c\",\"name\":\"x.txt\",\"mimeType\":\"text/plain\",\"parents\":[\"root-id\"]}",
            MediaType.APPLICATION_JSON));
    server.expect(requestTo(ROOT)).andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));

    assertEquals("a/b?c", client.get("token", "a/b?c").ref());
    server.verify();
  }

  @Test
  void itemsWithoutParentStayOutOfTheCatalog() {
    server.expect(requestTo(ROOT)).andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));
    server.expect(requestTo(containsString("/changes/startPageToken?")))
        .andRespond(withSuccess("{\"startPageToken\":\"changes-1\"}", MediaType.APPLICATION_JSON));
    server.expect(requestTo(containsString("/files?")))
        .andRespond(withSuccess("""
            {"files":[
              {"id":"mine","name":"a.txt","mimeType":"text/plain","parents":["root-id"]},
              {"id":"shared","name":"b.txt","mimeType":"text/plain"}
            ]}
            """, MediaType.APPLICATION_JSON));
    server.expect(requestTo(allOf(containsString("/changes?pageToken=changes-1"), containsString("restrictToMyDrive=true"))))
        .andRespond(withSuccess("""
            {"newStartPageToken":"changes-2","changes":[
              {"fileId":"unshared","file":{"id":"unshared","name":"c.txt","mimeType":"text/plain","parents":[]}}
            ]}
            """, MediaType.APPLICATION_JSON));

    SyncPage inventory = client.syncPage("token", null);
    SyncPage changes = client.syncPage("token", inventory.checkpoint());

    assertEquals(List.of("mine"), inventory.changes().stream().map(change -> change.ref()).toList());
    assertTrue(changes.changes().getFirst().deleted());
    server.verify();
  }

  @Test
  void shortcutsHaveNoContentToDownload() {
    CloudItem shortcut = new CloudItem("s", "google-drive", "atalho.pdf",
        com.bridgit.api.providers.ItemKind.FILE, "application/vnd.google-apps.shortcut",
        "pdf", null, null, null, true, null, null);

    ProviderApiException ex = assertThrows(ProviderApiException.class,
        () -> client.open("token", shortcut, ContentVariant.ORIGINAL));

    assertEquals("ITEM_SEM_CONTEUDO", ex.getCode());
    server.verify();
  }
}
