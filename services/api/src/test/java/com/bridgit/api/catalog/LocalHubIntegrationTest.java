package com.bridgit.api.catalog;

import com.bridgit.api.ApiIntegrationTestSupport;
import com.bridgit.api.integrations.*;
import com.bridgit.api.operations.*;
import com.bridgit.api.providers.*;
import com.bridgit.api.providers.sync.*;
import com.bridgit.api.files.FilesDtos;
import java.time.OffsetDateTime;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@TestPropertySource(properties = {"app.hub.catalog-enabled=true", "app.hub.operations-enabled=true", "app.hub.worker-enabled=false", "app.hub.direct-read-enabled=false"})
class LocalHubIntegrationTest extends ApiIntegrationTestSupport {
  @Autowired CatalogStore catalog;
  @Autowired CatalogService queries;
  @Autowired OperationStore operations;
  @Autowired OperationWorker executor;
  @Autowired ProviderConnectionRepository connections;
  @Autowired ReadAuthorizationService reads;
  @Autowired JdbcTemplate jdbc;
  @MockitoBean CloudProviderClients clients;
  @MockitoBean ProviderRetryService retry;
  private CloudProviderClient remote;
  private ProviderConnectionEntity connection;
  private UUID user;
  private String token;

  @BeforeEach void setup() throws Exception {
    var registered = registerUser("local_hub", "password123", UUID.randomUUID()).path("data");
    user = UUID.fromString(registered.path("user").path("id").asText());
    token = registered.path("accessToken").asText();
    connection = new ProviderConnectionEntity();
    connection.setUserId(user); connection.setProvider("onedrive"); connection.setAccountId("remote-account");
    connection.setEncryptedRefreshToken("unused"); connection.setConnectedAt(OffsetDateTime.now());
    connection = connections.saveAndFlush(connection);
    remote = mock(CloudProviderClient.class, withSettings().extraInterfaces(CloudSyncClient.class));
    when(remote.provider()).thenReturn(CloudProvider.ONEDRIVE);
    when(clients.get(CloudProvider.ONEDRIVE)).thenReturn(remote);
    when(retry.withRetry(any(), any())).thenAnswer(call -> ((ProviderRetryService.TokenCall<?>) call.getArgument(1)).execute("fixture-token"));
  }

  private CloudItem item(String ref, String name, String parent) {
    return new CloudItem(ref, "onedrive", name, ItemKind.FILE, "text/plain", "txt", 8L,
        OffsetDateTime.now(), parent, true, "etag-1", "content-1");
  }
  private void publish(List<CloudItem> items) {
    assertThat(catalog.claim(connection, "fixture")).isTrue();
    catalog.applyPage(connection, "fixture", catalog.state(connection.getId()),
        new SyncPage(items.stream().map(CloudChange::upsert).toList(), "checkpoint", true, "root-id"));
    catalog.release(connection, "fixture", 0, null);
  }

  @Test void repeatedCatalogNavigationMakesNoProviderRequests() throws Exception {
    publish(List.of(item("file-1", "Example.txt", null)));
    for (int i = 0; i < 5; i++) mockMvc.perform(get("/api/providers/onedrive/items").header("Authorization", "Bearer " + token))
        .andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].name").value("Example.txt"))
        .andExpect(jsonPath("$.data.catalog.coverage").value("complete"));
    verify(remote, never()).list(anyString(), any(), any());
    verify(remote, never()).get(anyString(), anyString());
  }

  @Test void cursorRevisionChangeIsExplicitAndNeverDuplicatesPages() {
    List<CloudItem> items = new ArrayList<>();
    for (int i = 0; i < 205; i++) items.add(item("file-" + i, String.format("%03d.txt", i), null));
    publish(items);
    FilesDtos.ListItemsResponse first = queries.list(connection, remote, null, null);
    assertThat(first.items()).hasSize(200);
    assertThat(queries.list(connection, remote, null, first.nextCursor()).items()).hasSize(5);
    catalog.confirmed(connection, item("new", "New.txt", null), null);
    assertThatThrownBy(() -> queries.list(connection, remote, null, first.nextCursor())).hasMessageContaining("atualizada");
  }

  @Test void resetKeepsPreviousInventoryUntilReplacementRoundCompletes() {
    publish(List.of(item("old", "Old.txt", null)));
    assertThat(catalog.claim(connection, "reset")).isTrue();
    catalog.reset(connection, "reset");
    catalog.applyPage(connection, "reset", catalog.state(connection.getId()), new SyncPage(List.of(CloudChange.upsert(item("new", "New.txt", null))), "next", false, "root"));
    assertThat(catalog.folder(connection, null).items()).extracting(CloudItem::ref).containsExactly("old");
    catalog.applyPage(connection, "reset", catalog.state(connection.getId()), new SyncPage(List.of(), "final", true, "root"));
    assertThat(catalog.folder(connection, null).items()).extracting(CloudItem::ref).containsExactly("new");
  }

  @Test void lostLeaseCannotCommitDataOrAdvanceCheckpoint() {
    catalog.claim(connection, "owner");
    CatalogStore.State state = catalog.state(connection.getId());
    assertThatThrownBy(() -> catalog.applyPage(connection, "other", state,
        new SyncPage(List.of(CloudChange.upsert(item("wrong", "Wrong.txt", null))), "wrong-cursor", true, null))).isInstanceOf(RuntimeException.class);
    assertThat(catalog.folder(connection, null).items()).isEmpty();
    assertThat(catalog.state(connection.getId()).checkpoint()).isNull();
  }

  @Test void partialSnapshotPreservesKnownAncestryAndVersion() {
    CloudItem original = item("file", "Before.txt", "parent");
    CloudItem partial = new CloudItem("file", "onedrive", "After.txt", ItemKind.FILE, null, null, null, null, null, false);
    CloudItem merged = CatalogStore.merge(original, new CloudChange("file", partial, false, null, null, Set.of("name")));
    assertThat(merged.name()).isEqualTo("After.txt");
    assertThat(merged.parentRef()).isEqualTo("parent");
    assertThat(merged.contentRevision()).isEqualTo("content-1");
  }

  private OperationDtos.Request request(String key, OperationDtos.Kind kind, String ref, String name) {
    return new OperationDtos.Request(key, "onedrive", connection.getId(), connection.getGeneration(), kind, ref, null, name, null, null, null);
  }

  @Test void idempotentSubmissionAndExecutionCreateOnlyOnce() {
    var request = request("same-key", OperationDtos.Kind.CREATE_FOLDER, null, "Folder");
    var accepted = operations.accept(user, connection, request, null);
    assertThat(operations.accept(user, connection, request, null).id()).isEqualTo(accepted.id());
    CloudItem folder = new CloudItem("folder", "onedrive", "Folder", ItemKind.FOLDER, null, null, null, null, null, true);
    when(remote.prepareCreate(anyString())).thenReturn(new PreparedWrite(null, null));
    when(remote.createFolderPrepared(anyString(), any(), eq("Folder"), any())).thenReturn(folder);
    executor.execute(accepted.id()); executor.execute(accepted.id());
    assertThat(operations.get(accepted.id()).status()).isEqualTo("SUCCEEDED");
    assertThat(catalog.entry(connection, "folder").item().kind()).isEqualTo(ItemKind.FOLDER);
    verify(remote, times(1)).createFolderPrepared(anyString(), any(), anyString(), any());
    assertThatThrownBy(() -> operations.accept(user, connection, request("same-key", OperationDtos.Kind.CREATE_FOLDER, null, "Other"), null)).isInstanceOf(RuntimeException.class);
  }

  @Test void ambiguousCreateIsVerifiedRatherThanRepeatedAfterRestart() {
    var accepted = operations.accept(user, connection, request("ambiguous", OperationDtos.Kind.CREATE_FOLDER, null, "Folder"), null);
    when(remote.prepareCreate(anyString())).thenReturn(new PreparedWrite(null, null));
    when(remote.createFolderPrepared(anyString(), any(), anyString(), any())).thenThrow(new ProviderApiException("response lost"));
    executor.execute(accepted.id());
    assertThat(operations.get(accepted.id()).status()).isEqualTo("VERIFYING");
    executor.execute(accepted.id());
    verify(remote, times(1)).createFolderPrepared(anyString(), any(), anyString(), any());
    assertThat(operations.get(accepted.id()).status()).isEqualTo("VERIFYING");
  }

  @Test void disconnectedIdentityFencesPendingWork() {
    var accepted = operations.accept(user, connection, request("old-generation", OperationDtos.Kind.CREATE_FOLDER, null, "Folder"), null);
    connections.deleteById(connection.getId()); connections.flush();
    executor.execute(accepted.id());
    assertThat(operations.get(accepted.id()).status()).isEqualTo("REJECTED");
    verify(remote, never()).createFolderPrepared(anyString(), any(), anyString(), any());
  }

  @Test void reconnectingTheSameAccountResumesItsQueuedIntentWithTheNewGeneration() {
    var accepted = operations.accept(user, connection, request("reconnect", OperationDtos.Kind.CREATE_FOLDER, null, "Folder"), null);
    connection.setGeneration(2); connections.saveAndFlush(connection);
    CloudItem folder = new CloudItem("folder", "onedrive", "Folder", ItemKind.FOLDER, null, null, null, null, null, true);
    when(remote.prepareCreate(anyString())).thenReturn(new PreparedWrite(null, null));
    when(remote.createFolderPrepared(anyString(), any(), eq("Folder"), any())).thenReturn(folder);
    executor.execute(accepted.id());
    assertThat(operations.get(accepted.id()).status()).isEqualTo("SUCCEEDED");
    assertThat(operations.get(accepted.id()).generation()).isEqualTo(2);
  }

  @Test void movingAChildDuringAPagedDeletionDoesNotDeleteTheMovedItem() {
    CloudItem folder = new CloudItem("parent", "onedrive", "Parent", ItemKind.FOLDER, null, null, null, null, null, true);
    publish(List.of(folder, item("child", "Child.txt", "parent")));
    assertThat(catalog.claim(connection, "delta")).isTrue();
    catalog.applyPage(connection, "delta", catalog.state(connection.getId()), new SyncPage(List.of(CloudChange.removed("parent")), "next", false, "root"));
    assertThat(catalog.entry(connection, "child").deleted()).isFalse();
    catalog.applyPage(connection, "delta", catalog.state(connection.getId()), new SyncPage(List.of(CloudChange.upsert(item("child", "Child.txt", null))), "end", true, "root"));
    assertThat(catalog.folder(connection, null).items()).extracting(CloudItem::ref).containsExactly("child");
  }

  @Test void authorizedReadDescriptorReusesMetadataForSameRevision() {
    CloudItem file = item("file", "File.txt", null);
    when(remote.get(anyString(), eq("file"))).thenReturn(file);
    when(remote.readPlan(any())).thenReturn(new ReadPlan(ReadMode.TEXT, ContentVariant.ORIGINAL, "text/plain"));
    var first = reads.describe(connection, remote, "file");
    var second = reads.describe(connection, remote, "file");
    assertThat(second.revision()).isEqualTo(first.revision());
    assertThat(second.connectionId()).isEqualTo(connection.getId());
    verify(remote, times(1)).get(anyString(), eq("file"));
  }

  @Test void operationsEndpointsRejectAnotherUsersOperation() throws Exception {
    var accepted = operations.accept(user, connection, request("private", OperationDtos.Kind.CREATE_FOLDER, null, "Folder"), null);
    String otherToken = registerUser("other_user", "password123", UUID.randomUUID()).path("data").path("accessToken").asText();
    mockMvc.perform(get("/api/operations/" + accepted.id()).header("Authorization", "Bearer " + otherToken)).andExpect(status().isNotFound());
  }
}
