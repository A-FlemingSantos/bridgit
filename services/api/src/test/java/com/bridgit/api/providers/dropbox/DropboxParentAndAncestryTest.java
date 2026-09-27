package com.bridgit.api.providers.dropbox;

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

class DropboxParentAndAncestryTest {

  private DropboxProviderClient client;
  private MockRestServiceServer server;

  @BeforeEach
  void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    client = new DropboxProviderClient(builder.build(), builder.build(), new ObjectMapper());
  }

  @Test
  void listAtRootMapsParentToNull() {
    server.expect(requestTo("https://api.dropboxapi.com/2/files/list_folder"))
        .andRespond(withSuccess("""
            {"entries": [
              {".tag": "file", "id": "id:file1", "name": "a.txt", "size": 5,
               "path_display": "/a.txt", "client_modified": "2026-01-01T00:00:00Z"}
            ], "has_more": false}
            """, MediaType.APPLICATION_JSON));

    ItemPage page = client.list("token", null, null);

    assertNull(page.items().get(0).parentRef());
    assertTrue(page.items().get(0).parentKnown());
    server.verify();
  }

  @Test
  void listInSubfolderCarriesFolderRef() {
    server.expect(requestTo("https://api.dropboxapi.com/2/files/list_folder"))
        .andRespond(withSuccess("""
            {"entries": [
              {".tag": "file", "id": "id:file2", "name": "b.txt", "size": 5,
               "path_display": "/Docs/b.txt", "client_modified": "2026-01-01T00:00:00Z"}
            ], "has_more": false}
            """, MediaType.APPLICATION_JSON));

    ItemPage page = client.list("token", "id:folder1", null);

    assertEquals("id:folder1", page.items().get(0).parentRef());
    assertTrue(page.items().get(0).parentKnown());
    server.verify();
  }

  @Test
  void getResolvesParentIdFromPath() {
    server.expect(requestTo("https://api.dropboxapi.com/2/files/get_metadata"))
        .andRespond(withSuccess("""
            {".tag": "file", "id": "id:file2", "name": "b.txt", "size": 5,
             "path_display": "/Docs/b.txt", "client_modified": "2026-01-01T00:00:00Z"}
            """, MediaType.APPLICATION_JSON));
    server.expect(requestTo("https://api.dropboxapi.com/2/files/get_metadata"))
        .andRespond(withSuccess("""
            {".tag": "folder", "id": "id:folder1", "name": "Docs", "path_display": "/Docs"}
            """, MediaType.APPLICATION_JSON));

    CloudItem item = client.get("token", "id:file2");

    assertEquals("id:folder1", item.parentRef());
    assertTrue(item.parentKnown());
    server.verify();
  }

  @Test
  void getAtRootMapsParentToNull() {
    server.expect(requestTo("https://api.dropboxapi.com/2/files/get_metadata"))
        .andRespond(withSuccess("""
            {".tag": "file", "id": "id:file1", "name": "a.txt", "size": 5,
             "path_display": "/a.txt", "client_modified": "2026-01-01T00:00:00Z"}
            """, MediaType.APPLICATION_JSON));

    CloudItem item = client.get("token", "id:file1");

    assertNull(item.parentRef());
    assertTrue(item.parentKnown());
    server.verify();
  }

  @Test
  void ancestryTwoLevelsDeepListsRootChildFirst() {
    server.expect(requestTo("https://api.dropboxapi.com/2/files/get_metadata"))
        .andRespond(withSuccess("""
            {".tag": "file", "id": "id:deep", "name": "deep.txt", "path_display": "/A/B/deep.txt"}
            """, MediaType.APPLICATION_JSON));
    server.expect(requestTo("https://api.dropboxapi.com/2/files/get_metadata"))
        .andRespond(withSuccess("""
            {".tag": "folder", "id": "id:a", "name": "A", "path_display": "/A"}
            """, MediaType.APPLICATION_JSON));
    server.expect(requestTo("https://api.dropboxapi.com/2/files/get_metadata"))
        .andRespond(withSuccess("""
            {".tag": "folder", "id": "id:b", "name": "B", "path_display": "/A/B"}
            """, MediaType.APPLICATION_JSON));

    List<CloudItem> ancestry = client.ancestry("token", "id:deep");

    assertEquals(List.of("id:a", "id:b"), ancestry.stream().map(CloudItem::ref).toList());
    server.verify();
  }

  @Test
  void ancestryAtRootIsEmpty() {
    server.expect(requestTo("https://api.dropboxapi.com/2/files/get_metadata"))
        .andRespond(withSuccess("""
            {".tag": "file", "id": "id:file1", "name": "a.txt", "path_display": "/a.txt"}
            """, MediaType.APPLICATION_JSON));

    assertTrue(client.ancestry("token", "id:file1").isEmpty());
    server.verify();
  }

  @Test
  void searchResultsHaveUnknownParent() {
    server.expect(requestTo("https://api.dropboxapi.com/2/files/search_v2"))
        .andRespond(withSuccess("""
            {"matches": [
              {"metadata": {"metadata":
                {".tag": "file", "id": "id:s1", "name": "found.txt", "size": 5,
                 "path_display": "/found.txt"}}}
            ]}
            """, MediaType.APPLICATION_JSON));

    List<CloudItem> results = client.search("token", "found", 10);

    assertNull(results.get(0).parentRef());
    assertFalse(results.get(0).parentKnown());
    server.verify();
  }
}
