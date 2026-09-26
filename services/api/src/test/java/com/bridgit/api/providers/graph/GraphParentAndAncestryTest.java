package com.bridgit.api.providers.graph;

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

class GraphParentAndAncestryTest {

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
  void listAtRootMapsParentToNull() {
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/root/children")))
        .andRespond(withSuccess("""
            {"value": [
              {"id": "file-1", "name": "a.txt", "size": 5,
               "file": {"mimeType": "text/plain"},
               "lastModifiedDateTime": "2026-01-01T00:00:00Z",
               "parentReference": {"id": "root-id"}}
            ]}
            """, MediaType.APPLICATION_JSON));

    ItemPage page = client.list("token", null, null);

    assertNull(page.items().get(0).parentRef());
    assertTrue(page.items().get(0).parentKnown());
    server.verify();
  }

  @Test
  void listInSubfolderCarriesFolderRef() {
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/items/folder-1/children")))
        .andRespond(withSuccess("""
            {"value": [
              {"id": "file-2", "name": "b.txt", "size": 5,
               "file": {"mimeType": "text/plain"},
               "lastModifiedDateTime": "2026-01-01T00:00:00Z",
               "parentReference": {"id": "folder-1"}}
            ]}
            """, MediaType.APPLICATION_JSON));

    ItemPage page = client.list("token", "folder-1", null);

    assertEquals("folder-1", page.items().get(0).parentRef());
    assertTrue(page.items().get(0).parentKnown());
    server.verify();
  }

  @Test
  void getMapsRootParentToNull() {
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/items/file-1?")))
        .andRespond(withSuccess("""
            {"id": "file-1", "name": "a.txt", "size": 5,
             "file": {"mimeType": "text/plain"},
             "parentReference": {"id": "root-id"}}
            """, MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/drive/root?")))
        .andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));

    CloudItem item = client.get("token", "file-1");

    assertNull(item.parentRef());
    assertTrue(item.parentKnown());
    server.verify();
  }

  @Test
  void ancestryTwoLevelsDeepExcludesItemAndRoot() {
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/drive/root?")))
        .andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/items/file-9?")))
        .andRespond(withSuccess("""
            {"id": "file-9", "name": "deep.txt",
             "parentReference": {"id": "folder-b"}}
            """, MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/items/folder-b?")))
        .andRespond(withSuccess("""
            {"id": "folder-b", "name": "B",
             "parentReference": {"id": "folder-a"}}
            """, MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/items/folder-a?")))
        .andRespond(withSuccess("""
            {"id": "folder-a", "name": "A",
             "parentReference": {"id": "root-id"}}
            """, MediaType.APPLICATION_JSON));

    List<CloudItem> ancestry = client.ancestry("token", "file-9");

    assertEquals(List.of("folder-a", "folder-b"), ancestry.stream().map(CloudItem::ref).toList());
    assertNull(ancestry.get(0).parentRef());
    assertEquals("folder-a", ancestry.get(1).parentRef());
    server.verify();
  }

  @Test
  void ancestryFileAtRootIsEmpty() {
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/drive/root?")))
        .andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/items/file-1?")))
        .andRespond(withSuccess("""
            {"id": "file-1", "name": "a.txt",
             "parentReference": {"id": "root-id"}}
            """, MediaType.APPLICATION_JSON));

    assertTrue(client.ancestry("token", "file-1").isEmpty());
    server.verify();
  }

  @Test
  void searchResultsHaveUnknownParent() {
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/root/search")))
        .andRespond(withSuccess("""
            {"value": [
              {"id": "file-3", "name": "c.txt", "size": 5,
               "file": {"mimeType": "text/plain"},
               "parentReference": {"id": "folder-x"}}
            ]}
            """, MediaType.APPLICATION_JSON));

    List<CloudItem> results = client.search("token", "c", 10);

    assertNull(results.get(0).parentRef());
    assertFalse(results.get(0).parentKnown());
    server.verify();
  }
}
