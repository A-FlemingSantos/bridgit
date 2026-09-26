package com.bridgit.api.providers.drive;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.ItemPage;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class DriveParentAndAncestryTest {

  private GoogleDriveProviderClient client;
  private MockRestServiceServer server;

  @BeforeEach
  void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    client = new GoogleDriveProviderClient(builder.build(), new ObjectMapper());
  }

  @Test
  void listAtRootMapsParentToNull() {
    server.expect(requestTo("https://www.googleapis.com/drive/v3/files/root?fields=id"))
        .andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/drive/v3/files?q=")))
        .andRespond(withSuccess("""
            {"files": [
              {"id": "file-1", "name": "a.txt", "mimeType": "text/plain", "size": "5",
               "modifiedTime": "2026-01-01T00:00:00Z", "parents": ["root-id"]}
            ]}
            """, MediaType.APPLICATION_JSON));

    ItemPage page = client.list("token", null, null);

    assertNull(page.items().get(0).parentRef());
    assertTrue(page.items().get(0).parentKnown());
    server.verify();
  }

  @Test
  void getWithoutVisibleParentsIsUnknown() {
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/files/shared-1?")))
        .andRespond(withSuccess("""
            {"id": "shared-1", "name": "shared.txt", "mimeType": "text/plain"}
            """, MediaType.APPLICATION_JSON));
    server.expect(requestTo("https://www.googleapis.com/drive/v3/files/root?fields=id"))
        .andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));

    CloudItem item = client.get("token", "shared-1");

    assertNull(item.parentRef());
    assertFalse(item.parentKnown());
    server.verify();
  }

  @Test
  void ancestryStartsAtParentAndExcludesItemAndRoot() {
    server.expect(requestTo("https://www.googleapis.com/drive/v3/files/root?fields=id"))
        .andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/files/file-9?")))
        .andRespond(withSuccess("""
            {"id": "file-9", "name": "deep.txt", "parents": ["folder-b"]}
            """, MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/files/folder-b?")))
        .andRespond(withSuccess("""
            {"id": "folder-b", "name": "B", "parents": ["folder-a"]}
            """, MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/files/folder-a?")))
        .andRespond(withSuccess("""
            {"id": "folder-a", "name": "A", "parents": ["root-id"]}
            """, MediaType.APPLICATION_JSON));

    List<CloudItem> ancestry = client.ancestry("token", "file-9");

    assertEquals(List.of("folder-a", "folder-b"), ancestry.stream().map(CloudItem::ref).toList());
    server.verify();
  }

  @Test
  void ancestryFileAtRootIsEmpty() {
    server.expect(requestTo("https://www.googleapis.com/drive/v3/files/root?fields=id"))
        .andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/files/file-1?")))
        .andRespond(withSuccess("""
            {"id": "file-1", "name": "a.txt", "parents": ["root-id"]}
            """, MediaType.APPLICATION_JSON));

    assertTrue(client.ancestry("token", "file-1").isEmpty());
    server.verify();
  }

  @Test
  void ancestryWithoutVisibleParentsIsEmpty() {
    server.expect(requestTo("https://www.googleapis.com/drive/v3/files/root?fields=id"))
        .andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/files/orphan?")))
        .andRespond(withSuccess("{\"id\": \"orphan\", \"name\": \"o.txt\"}", MediaType.APPLICATION_JSON));

    assertTrue(client.ancestry("token", "orphan").isEmpty());
    server.verify();
  }

  @Test
  void ancestryFolderTwoLevelsDeep() {
    server.expect(requestTo("https://www.googleapis.com/drive/v3/files/root?fields=id"))
        .andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/files/folder-c?")))
        .andRespond(withSuccess("""
            {"id": "folder-c", "name": "C", "parents": ["folder-b"]}
            """, MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/files/folder-b?")))
        .andRespond(withSuccess("""
            {"id": "folder-b", "name": "B", "parents": ["folder-a"]}
            """, MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/files/folder-a?")))
        .andRespond(withSuccess("""
            {"id": "folder-a", "name": "A", "parents": ["root-id"]}
            """, MediaType.APPLICATION_JSON));

    List<CloudItem> ancestry = client.ancestry("token", "folder-c");

    assertEquals(List.of("folder-a", "folder-b"), ancestry.stream().map(CloudItem::ref).toList());
    server.verify();
  }
}
