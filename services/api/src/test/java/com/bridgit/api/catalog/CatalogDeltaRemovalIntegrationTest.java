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
import com.bridgit.api.providers.ProviderApiException;
import com.bridgit.api.providers.sync.CloudChange;
import com.bridgit.api.providers.sync.CloudSyncClient;
import com.bridgit.api.providers.sync.SyncPage;
import com.bridgit.api.providers.sync.SyncResetException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** A removal the feed reports without the deleted facet must not keep an unfenced item in the catalog. */
@TestPropertySource(properties = {"app.hub.catalog-enabled=true", "app.hub.operations-enabled=true",
    "app.hub.worker-enabled=false", "app.hub.direct-read-enabled=false"})
class CatalogDeltaRemovalIntegrationTest extends ApiIntegrationTestSupport {
  @Autowired CatalogStore catalog;
  @Autowired CatalogWorker worker;
  @Autowired ProviderConnectionRepository connections;
  @MockitoBean CloudProviderClients clients;
  @MockitoBean ProviderRetryService retry;
  private CloudProviderClient remote;
  private CloudSyncClient feed;
  private ProviderConnectionEntity connection;

  @BeforeEach void setup() throws Exception {
    var registered = registerUser("delta_removal", "password123", UUID.randomUUID()).path("data");
    connection = new ProviderConnectionEntity();
    connection.setUserId(UUID.fromString(registered.path("user").path("id").asText()));
    connection.setProvider("onedrive"); connection.setAccountId("remote-account");
    connection.setEncryptedRefreshToken("unused"); connection.setConnectedAt(OffsetDateTime.now());
    connection = connections.saveAndFlush(connection);
    remote = mock(CloudProviderClient.class, withSettings().extraInterfaces(CloudSyncClient.class));
    feed = (CloudSyncClient) remote;
    when(remote.provider()).thenReturn(CloudProvider.ONEDRIVE);
    when(clients.get(CloudProvider.ONEDRIVE)).thenReturn(remote);
    when(retry.withRetry(any(), any())).thenAnswer(call -> ((ProviderRetryService.TokenCall<?>) call.getArgument(1)).execute("fixture-token"));
  }

  private CloudItem folder(String ref, String name) {
    return new CloudItem(ref, "onedrive", name, ItemKind.FOLDER, null, null, null,
        OffsetDateTime.now(), null, true, "etag-1", null);
  }
  private void runSync() {
    catalog.schedule(connection.getId());
    worker.sync(connection);
  }

  @Test void deltaEntryWithoutNameOrKindIsCheckedWithTheProviderEvenWhenTheItemIsKnown() {
    catalog.rememberItem(connection, folder("ghost", "Nova pasta"));
    // What a removal looks like when the deleted facet is projected away: only id and parentReference.
    CloudItem bare = new CloudItem("ghost", "onedrive", null, ItemKind.FILE, null, null, null, null, null, true, null, null);
    when(feed.syncPage(any(), any())).thenReturn(new SyncPage(
        List.of(new CloudChange("ghost", bare, false, null, null, Set.of("parentRef"))), "checkpoint-2", true, "root-id"));
    when(remote.get(anyString(), eq("ghost"))).thenThrow(new ProviderApiException(HttpStatus.NOT_FOUND, "ITEM_NAO_ENCONTRADO", "Item não encontrado."));

    runSync();

    verify(remote, times(1)).get(anyString(), eq("ghost"));
    assertThat(catalog.entry(connection, "ghost").deleted()).isTrue();
    assertThat(catalog.folder(connection, null).items()).isEmpty();
  }

  @Test void inventoryResetDropsItemsTheProviderNoLongerEnumerates() {
    catalog.rememberItem(connection, folder("real", "Nova pasta"));
    catalog.rememberItem(connection, folder("ghost", "Nova pasta"));
    when(feed.syncPage(any(), any()))
        .thenThrow(new SyncResetException("Checkpoint OneDrive sem a faceta deleted."))
        .thenReturn(new SyncPage(List.of(CloudChange.upsert(folder("real", "Nova pasta"))), "checkpoint-fresh", true, "root-id"));

    runSync();
    runSync();

    assertThat(catalog.folder(connection, null).items()).extracting(CloudItem::ref).containsExactly("real");
    assertThat(catalog.state(connection.getId()).checkpoint()).isEqualTo("checkpoint-fresh");
  }
}
