package com.bridgit.api.providers.graph;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.bridgit.api.providers.sync.SyncPage;
import com.bridgit.api.providers.sync.SyncResetException;
import com.bridgit.api.providers.sync.WatchRegistration;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class GraphSyncClientTest {

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
  void syncPagesReplayTheNextLinkAndRetainTheFinalDeltaLink() {
    String first = "https://graph.microsoft.com/v1.0/me/drive/root/delta?$select="
        + "id,name,size,file,folder,lastModifiedDateTime,parentReference,eTag,cTag";
    String next = "https://graph.microsoft.com/v1.0/me/drive/delta?$skiptoken=next";
    String delta = "https://graph.microsoft.com/v1.0/me/drive/root/delta?$deltatoken=done";
    expectRoot();
    server.expect(requestTo(first)).andRespond(withSuccess("""
        {"value":[{"id":"root-id","name":"Drive","folder":{},"root":{}},
          {"id":"file-1","name":"one.txt","size":1,
          "file":{"mimeType":"text/plain"},"eTag":"etag-1","cTag":"ctag-1",
          "parentReference":{"id":"root-id","path":"/drive/root:"}}],
          "@odata.nextLink":"%s"}
        """.formatted(next), MediaType.APPLICATION_JSON));
    server.expect(requestTo(next)).andRespond(withSuccess("""
        {"value":[],"@odata.deltaLink":"%s"}
        """.formatted(delta), MediaType.APPLICATION_JSON));

    SyncPage page = client.syncPage("token", null);

    assertFalse(page.caughtUp());
    assertTrue(page.checkpoint().contains(next));
    assertEquals("root-id", page.rootRef());
    assertEquals(1, page.changes().size());
    assertNull(page.changes().getFirst().item().parentRef());
    assertEquals("etag-1", page.changes().getFirst().item().remoteVersion());
    assertEquals("ctag-1", page.changes().getFirst().item().contentRevision());
    assertEquals("/one.txt", page.changes().getFirst().path());
    assertEquals("/", page.changes().getFirst().parentPath());

    SyncPage replayed = client.syncPage("token", page.checkpoint());

    assertTrue(replayed.caughtUp());
    assertTrue(replayed.checkpoint().contains(delta));
    server.verify();
  }

  @Test
  void syncMapsDeletedAndPartialDeltaEntriesWithoutInventingKnownFields() {
    expectRoot();
    server.expect(requestTo("https://graph.microsoft.com/v1.0/me/drive/root/delta?$select="
        + "id,name,size,file,folder,lastModifiedDateTime,parentReference,eTag,cTag"))
        .andRespond(withSuccess("""
            {"value":[
              {"id":"gone","deleted":{}},
              {"id":"partial","name":"renamed.txt","eTag":"etag-2"}
            ],"@odata.deltaLink":"https://graph.microsoft.com/v1.0/me/drive/root/delta?$deltatoken=done"}
            """, MediaType.APPLICATION_JSON));

    SyncPage page = client.syncPage("token", null);

    assertTrue(page.changes().get(0).deleted());
    assertNull(page.changes().get(0).item());
    assertEquals("gone", page.changes().get(0).ref());
    assertEquals(java.util.Set.of(), page.changes().get(0).knownFields());
    assertEquals(java.util.Set.of("name", "extension", "remoteVersion"), page.changes().get(1).knownFields());
    assertFalse(page.changes().get(1).item().parentKnown());
    assertEquals("etag-2", page.changes().get(1).item().remoteVersion());
    server.verify();
  }

  @Test
  void expiredCheckpointRequestsAnInventoryReset() {
    expectRoot();
    String checkpoint = "https://graph.microsoft.com/v1.0/me/drive/root/delta?$deltatoken=expired";
    server.expect(requestTo(checkpoint)).andRespond(withStatus(HttpStatus.GONE));

    assertThrows(SyncResetException.class, () -> client.syncPage("token", checkpoint));
    server.verify();
  }

  @Test
  void conditionalWritesUseIfMatchAndDirectReadUsesTheGraphDownloadUrl() {
    server.expect(requestTo("https://graph.microsoft.com/v1.0/me/drive/items/item-1"))
        .andExpect(method(HttpMethod.PATCH))
        .andExpect(header(HttpHeaders.IF_MATCH, "etag-1"))
        .andRespond(withSuccess("""
            {"id":"item-1","name":"renamed.txt","file":{"mimeType":"text/plain"},
             "eTag":"etag-2","cTag":"ctag-2","parentReference":{"id":"root-id"}}
            """, MediaType.APPLICATION_JSON));
    expectRoot();
    server.expect(requestTo("https://graph.microsoft.com/v1.0/me/drive/items/item-1"))
        .andExpect(method(HttpMethod.DELETE))
        .andExpect(header(HttpHeaders.IF_MATCH, "etag-2"))
        .andRespond(withStatus(HttpStatus.NO_CONTENT));
    server.expect(requestTo("https://graph.microsoft.com/v1.0/me/drive/items/item-1?$select=@microsoft.graph.downloadUrl"))
        .andRespond(withSuccess("{\"@microsoft.graph.downloadUrl\":\"https://download.example/original\"}",
            MediaType.APPLICATION_JSON));

    var updated = client.updateConditional("token", "item-1", "renamed.txt", null, "etag-1");

    assertEquals("etag-2", updated.remoteVersion());
    assertEquals("ctag-2", updated.contentRevision());
    client.deleteConditional("token", "item-1", "etag-2");

    assertEquals("https://download.example/original", client.directReadUrl("token", "item-1"));
    server.verify();
  }

  @Test
  void createsAndRenewsTheDefaultDriveSubscription() {
    server.expect(requestTo("https://graph.microsoft.com/v1.0/subscriptions"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer token"))
        .andExpect(content().string(org.hamcrest.Matchers.allOf(
            org.hamcrest.Matchers.containsString("\"resource\":\"/me/drive/root\""),
            org.hamcrest.Matchers.containsString("\"clientState\":\"state\"")
        )))
        .andRespond(withSuccess("""
            {"id":"sub-1","resource":"/me/drive/root","expirationDateTime":"2026-01-01T00:00:00Z"}
            """, MediaType.APPLICATION_JSON));
    server.expect(requestTo("https://graph.microsoft.com/v1.0/subscriptions/sub-1"))
        .andExpect(method(HttpMethod.PATCH))
        .andRespond(withSuccess("""
            {"id":"sub-1","resource":"/me/drive/root","expirationDateTime":"2026-01-02T00:00:00Z"}
            """, MediaType.APPLICATION_JSON));

    WatchRegistration created = client.watch("token", "https://app.example/hook", "state", null);

    assertEquals("sub-1", created.id());
    WatchRegistration renewed = client.watch("token", "https://app.example/hook", "state", created);

    assertEquals("sub-1", renewed.id());
    server.verify();
  }

  private void expectRoot() {
    server.expect(requestTo("https://graph.microsoft.com/v1.0/me/drive/root?$select=id"))
        .andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));
  }
}
