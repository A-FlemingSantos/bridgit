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
import java.time.OffsetDateTime;
import java.util.List;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Feed reports a removal: a fenced local item is confirmed with client.get before it leaves the catalog. */
@TestPropertySource(properties = {"app.hub.catalog-enabled=true", "app.hub.operations-enabled=true",
    "app.hub.worker-enabled=false", "app.hub.direct-read-enabled=false"})
class CatalogFencedRemovalIntegrationTest extends ApiIntegrationTestSupport {
  @Autowired CatalogStore catalog;
  @Autowired CatalogWorker worker;
  @Autowired ProviderConnectionRepository connections;
  @MockitoBean CloudProviderClients clients;
  @MockitoBean ProviderRetryService retry;
  private CloudProviderClient remote;
  private CloudSyncClient feed;
  private ProviderConnectionEntity connection;
  private UUID user;
  private String token;

  @BeforeEach void setup() throws Exception {
    var registered = registerUser("fenced_removal", "password123", UUID.randomUUID()).path("data");
    user = UUID.fromString(registered.path("user").path("id").asText());
    token = registered.path("accessToken").asText();
    connection = new ProviderConnectionEntity();
    connection.setUserId(user); connection.setProvider("onedrive"); connection.setAccountId("remote-account");
    connection.setEncryptedRefreshToken("unused"); connection.setConnectedAt(OffsetDateTime.now());
    connection = connections.saveAndFlush(connection);
    remote = mock(CloudProviderClient.class, withSettings().extraInterfaces(CloudSyncClient.class));
    feed = (CloudSyncClient) remote;
    when(remote.provider()).thenReturn(CloudProvider.ONEDRIVE);
    when(clients.get(CloudProvider.ONEDRIVE)).thenReturn(remote);
    when(retry.withRetry(any(), any())).thenAnswer(call -> ((ProviderRetryService.TokenCall<?>) call.getArgument(1)).execute("fixture-token"));
  }

  private CloudItem file(String ref) {
    return new CloudItem(ref, "onedrive", "Example.txt", ItemKind.FILE, "text/plain", "txt", 8L,
        OffsetDateTime.now(), null, true, "etag-1", "content-1");
  }
  private void feedReportsRemoval(String ref) {
    when(feed.syncPage(any(), any())).thenReturn(
        new SyncPage(List.of(CloudChange.removed(ref)), "checkpoint-after-removal", true, "root-id"));
  }
  private void runSync() {
    catalog.schedule(connection.getId()); // next_run=now, so the claim inside sync is allowed
    worker.sync(connection);
  }

  @Test void fencedItemThatProviderNoLongerReturnsLeavesTheCatalogAfterSync() throws Exception {
    catalog.confirmed(connection, file("file-1"), null);
    assertThat(catalog.folder(connection, null).items()).extracting(CloudItem::ref).containsExactly("file-1");
    feedReportsRemoval("file-1");
    when(remote.get(anyString(), eq("file-1"))).thenThrow(new ProviderApiException(HttpStatus.NOT_FOUND, "ITEM_NAO_ENCONTRADO", "Item não encontrado."));

    runSync();

    verify(remote, times(1)).get(anyString(), eq("file-1"));
    assertThat(catalog.entry(connection, "file-1").deleted()).isTrue();
    assertThat(catalog.folder(connection, null).items()).isEmpty();
    mockMvc.perform(get("/api/providers/onedrive/items").header("Authorization", "Bearer " + token))
        .andExpect(status().isOk()).andExpect(jsonPath("$.data.items").isEmpty());
  }

  @Test void fencedItemStillReturnedByProviderIsKeptWhenTheFeedSaysRemoved() {
    catalog.confirmed(connection, file("file-1"), null);
    feedReportsRemoval("file-1");
    when(remote.get(anyString(), eq("file-1"))).thenReturn(file("file-1"));

    runSync();

    verify(remote, times(1)).get(anyString(), eq("file-1"));
    assertThat(catalog.entry(connection, "file-1").deleted()).isFalse();
    assertThat(catalog.folder(connection, null).items()).extracting(CloudItem::ref).containsExactly("file-1");
  }

  @Test void unfencedItemRemovedByTheFeedIsRemovedWithoutAProviderLookup() {
    catalog.rememberItem(connection, file("file-2"));
    feedReportsRemoval("file-2");

    runSync();

    verify(remote, never()).get(anyString(), anyString());
    assertThat(catalog.entry(connection, "file-2").deleted()).isTrue();
    assertThat(catalog.folder(connection, null).items()).isEmpty();
  }
}
