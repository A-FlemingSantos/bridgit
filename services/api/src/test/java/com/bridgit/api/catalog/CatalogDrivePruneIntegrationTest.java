package com.bridgit.api.catalog;

import com.bridgit.api.ApiIntegrationTestSupport;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionRepository;
import com.bridgit.api.integrations.ProviderRetryService;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClient;
import com.bridgit.api.providers.CloudProviderClients;
import com.bridgit.api.providers.ItemKind;
import com.bridgit.api.providers.sync.CloudChange;
import com.bridgit.api.providers.sync.CloudSyncClient;
import com.bridgit.api.providers.sync.SyncPage;
import com.bridgit.api.providers.sync.SyncResetException;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** A full Google Drive inventory keeps only what is reachable from My Drive (Findings 12). */
@TestPropertySource(properties = {"app.hub.catalog-enabled=true", "app.hub.operations-enabled=true",
    "app.hub.worker-enabled=false", "app.hub.direct-read-enabled=false"})
class CatalogDrivePruneIntegrationTest extends ApiIntegrationTestSupport {
  @Autowired CatalogStore catalog;
  @Autowired CatalogWorker worker;
  @Autowired ProviderConnectionRepository connections;
  @MockitoBean CloudProviderClients clients;
  @MockitoBean ProviderRetryService retry;
  private CloudSyncClient feed;
  private ProviderConnectionEntity connection;
  private String provider;
  private String token;

  private void connectTo(CloudProvider cloud) throws Exception {
    var registered = registerUser("drive_prune", "password123", UUID.randomUUID()).path("data");
    token = registered.path("accessToken").asText();
    provider = cloud.id();
    connection = new ProviderConnectionEntity();
    connection.setUserId(UUID.fromString(registered.path("user").path("id").asText()));
    connection.setProvider(provider); connection.setAccountId("remote-account");
    connection.setEncryptedRefreshToken("unused"); connection.setConnectedAt(OffsetDateTime.now());
    connection = connections.saveAndFlush(connection);
    CloudProviderClient remote = mock(CloudProviderClient.class, withSettings().extraInterfaces(CloudSyncClient.class));
    feed = (CloudSyncClient) remote;
    when(remote.provider()).thenReturn(cloud);
    when(clients.get(cloud)).thenReturn(remote);
    when(retry.withRetry(any(), any())).thenAnswer(call -> ((ProviderRetryService.TokenCall<?>) call.getArgument(1)).execute("fixture-token"));
  }

  private CloudItem item(String ref, String name, ItemKind kind, String parent, boolean parentKnown) {
    return new CloudItem(ref, provider, name, kind, kind == ItemKind.FILE ? "text/plain" : null, null, kind == ItemKind.FILE ? 8L : null,
        OffsetDateTime.now(), parent, parentKnown, "etag-" + ref, null);
  }

  private List<CloudChange> myDrive() {
    return List.of(
        CloudChange.upsert(item("docs", "Documentos", ItemKind.FOLDER, null, true)),
        CloudChange.upsert(item("report", "Relatorio.txt", ItemKind.FILE, "docs", true)),
        CloudChange.upsert(item("top", "Solto.txt", ItemKind.FILE, null, true)));
  }

  /** Children of a shared folder the user never added to My Drive: the folder itself is not in the inventory. */
  private List<CloudChange> sharedElsewhere() {
    return List.of(
        CloudChange.upsert(item("photo1", "Foto 1.jpg", ItemKind.FILE, "shared-folder", true)),
        CloudChange.upsert(item("shared-sub", "Subpasta compartilhada", ItemKind.FOLDER, "shared-folder", true)),
        CloudChange.upsert(item("photo2", "Foto 2.jpg", ItemKind.FILE, "shared-sub", true)));
  }

  private static List<CloudChange> concat(List<CloudChange> first, List<CloudChange> second) {
    List<CloudChange> all = new ArrayList<>(first);
    all.addAll(second);
    return all;
  }

  private void runSync() {
    catalog.schedule(connection.getId());
    worker.sync(connection);
  }

  private boolean has(String ref) {
    CatalogStore.Entry entry = catalog.entry(connection, ref);
    return entry != null && !entry.deleted();
  }

  private List<String> searchRefs(String term) throws Exception {
    JsonNode data = readJson(mockMvc.perform(get("/api/search").param("q", term).header("Authorization", "Bearer " + token))
        .andExpect(status().isOk()).andReturn()).path("data");
    List<String> refs = new ArrayList<>();
    data.path("results").forEach(result -> refs.add(result.path("ref").asText()));
    return refs;
  }

  @Test void firstFullDriveInventoryKeepsOnlyTheMyDriveTree() throws Exception {
    connectTo(CloudProvider.GOOGLE_DRIVE);
    when(feed.syncPage(any(), any())).thenReturn(new SyncPage(concat(myDrive(), sharedElsewhere()), "checkpoint-1", true, "root-id"));

    runSync();

    assertThat(catalog.state(connection.getId()).complete()).isTrue();
    assertThat(has("docs")).isTrue();
    assertThat(has("report")).isTrue();
    assertThat(has("top")).isTrue();
    assertThat(has("photo1")).isFalse();
    assertThat(has("shared-sub")).isFalse();
    assertThat(has("photo2")).isFalse();
    assertThat(searchRefs("Foto")).isEmpty();
    assertThat(searchRefs("Relatorio")).containsExactly("report");
  }

  @Test void aRebuiltDriveScanDropsWhatLeftMyDrive() throws Exception {
    connectTo(CloudProvider.GOOGLE_DRIVE);
    // What an older catalog holds: the shared children are in the active scan.
    when(feed.syncPage(any(), any()))
        .thenReturn(new SyncPage(concat(myDrive(), sharedElsewhere()), "checkpoint-1", false, "root-id"))
        .thenThrow(new SyncResetException("Checkpoint do Google Drive invalido."))
        .thenReturn(new SyncPage(concat(myDrive(), sharedElsewhere()), "checkpoint-2", true, "root-id"));
    runSync();
    assertThat(has("photo1")).isTrue();
    runSync();
    assertThat(catalog.state(connection.getId()).buildingScan()).isGreaterThan(catalog.state(connection.getId()).activeScan());

    runSync();

    assertThat(has("docs")).isTrue();
    assertThat(has("report")).isTrue();
    assertThat(has("photo1")).isFalse();
    assertThat(has("photo2")).isFalse();
    assertThat(searchRefs("Foto")).isEmpty();
  }

  @Test void anIncrementalDrivePageDoesNotPrune() throws Exception {
    connectTo(CloudProvider.GOOGLE_DRIVE);
    when(feed.syncPage(any(), any()))
        .thenReturn(new SyncPage(myDrive(), "checkpoint-1", true, "root-id"))
        .thenReturn(new SyncPage(List.of(CloudChange.upsert(item("late", "Chegou depois.txt", ItemKind.FILE, "not-yet-known", true))),
            "checkpoint-2", true, "root-id"));
    runSync();
    CatalogStore.State complete = catalog.state(connection.getId());
    assertThat(complete.complete()).isTrue();
    assertThat(complete.activeScan()).isEqualTo(complete.buildingScan());

    runSync();

    assertThat(has("late")).isTrue();
    assertThat(has("docs")).isTrue();
  }

  @Test void otherProvidersKeepRowsWhoseParentIsNotInTheInventory() throws Exception {
    connectTo(CloudProvider.ONEDRIVE);
    when(feed.syncPage(any(), any())).thenReturn(new SyncPage(concat(myDrive(), sharedElsewhere()), "checkpoint-1", true, "root-id"));

    runSync();

    assertThat(catalog.state(connection.getId()).complete()).isTrue();
    assertThat(has("docs")).isTrue();
    assertThat(has("photo1")).isTrue();
    assertThat(has("photo2")).isTrue();
  }
}
