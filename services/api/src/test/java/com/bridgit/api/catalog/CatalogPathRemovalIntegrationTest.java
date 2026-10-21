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

/** A removal known only by path (Dropbox) clears that path, without dropping a row Bridgit wrote that still exists. */
@TestPropertySource(properties = {"app.hub.catalog-enabled=true", "app.hub.operations-enabled=true",
    "app.hub.worker-enabled=false", "app.hub.direct-read-enabled=false"})
class CatalogPathRemovalIntegrationTest extends ApiIntegrationTestSupport {
  @Autowired CatalogStore catalog;
  @Autowired CatalogWorker worker;
  @Autowired ProviderConnectionRepository connections;
  @MockitoBean CloudProviderClients clients;
  @MockitoBean ProviderRetryService retry;
  private CloudProviderClient remote;
  private CloudSyncClient feed;
  private ProviderConnectionEntity connection;

  @BeforeEach void setup() throws Exception {
    var registered = registerUser("path_removal", "password123", UUID.randomUUID()).path("data");
    connection = new ProviderConnectionEntity();
    connection.setUserId(UUID.fromString(registered.path("user").path("id").asText()));
    connection.setProvider("dropbox"); connection.setAccountId("dropbox-account");
    connection.setEncryptedRefreshToken("unused"); connection.setConnectedAt(OffsetDateTime.now());
    connection = connections.saveAndFlush(connection);
    remote = mock(CloudProviderClient.class, withSettings().extraInterfaces(CloudSyncClient.class));
    feed = (CloudSyncClient) remote;
    when(remote.provider()).thenReturn(CloudProvider.DROPBOX);
    when(clients.get(CloudProvider.DROPBOX)).thenReturn(remote);
    when(retry.withRetry(any(), any())).thenAnswer(call -> ((ProviderRetryService.TokenCall<?>) call.getArgument(1)).execute("fixture-token"));
  }

  @Test void uploadingAndRemovingTheSameNameAgainLeavesNoCopyBehind() {
    sync(List.of(listed("id:a"), removed(), listed("id:b")), "cp-1");
    sync(List.of(removed()), "cp-2");

    assertThat(catalog.folder(connection, null).items()).isEmpty();
  }

  @Test void aFileRecreatedInTheSamePageSurvivesTheEarlierRemoval() {
    sync(List.of(listed("id:a"), removed(), listed("id:b")), "cp-1");

    assertThat(catalog.folder(connection, null).items()).extracting(CloudItem::ref).containsExactly("id:b");
  }

  @Test void aFileBridgitWroteIsConfirmedByIdAndKeptWhenItStillExists() {
    catalog.confirmed(connection, file("id:mine"), null);
    when(remote.get(any(), eq("id:mine"))).thenReturn(file("id:mine"));
    sync(List.of(listed("id:mine")), "cp-1");

    sync(List.of(removed()), "cp-2");

    verify(remote, atLeastOnce()).get(any(), eq("id:mine"));
    assertThat(catalog.folder(connection, null).items()).extracting(CloudItem::ref).containsExactly("id:mine");
  }

  @Test void aFileBridgitWroteIsDroppedWhenTheProviderNoLongerHasIt() {
    catalog.confirmed(connection, file("id:mine"), null);
    when(remote.get(any(), eq("id:mine"))).thenReturn(file("id:mine"));
    sync(List.of(listed("id:mine")), "cp-1");
    when(remote.get(any(), eq("id:mine"))).thenThrow(new ProviderApiException(HttpStatus.NOT_FOUND, "ITEM_NAO_ENCONTRADO", "Não encontrado."));

    sync(List.of(removed()), "cp-2");

    assertThat(catalog.folder(connection, null).items()).isEmpty();
  }

  private void sync(List<CloudChange> changes, String checkpoint) {
    when(feed.syncPage(any(), any())).thenReturn(new SyncPage(changes, checkpoint, true, null));
    catalog.schedule(connection.getId());
    worker.sync(connection);
  }

  private static CloudItem file(String ref) {
    return new CloudItem(ref, "dropbox", "fala.pdf", ItemKind.FILE, "application/pdf", "pdf", 10L,
        OffsetDateTime.now(), null, true, "rev-" + ref, "hash-" + ref);
  }

  private static CloudChange listed(String ref) {
    CloudItem item = file(ref);
    return new CloudChange(ref, item, false, "/fala.pdf", "", CloudChange.upsert(item).knownFields());
  }

  private static CloudChange removed() {
    return new CloudChange(null, null, true, "/fala.pdf", "", Set.of());
  }
}
