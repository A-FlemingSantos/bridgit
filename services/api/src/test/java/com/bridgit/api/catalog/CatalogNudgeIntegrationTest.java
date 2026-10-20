package com.bridgit.api.catalog;

import com.bridgit.api.ApiIntegrationTestSupport;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionRepository;
import com.bridgit.api.integrations.ProviderRetryService;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClient;
import com.bridgit.api.providers.CloudProviderClients;
import com.bridgit.api.providers.ContentVariant;
import com.bridgit.api.providers.ItemKind;
import com.bridgit.api.providers.ProviderApiException;
import com.bridgit.api.providers.ReadMode;
import com.bridgit.api.providers.ReadPlan;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Using a connection, or finding the catalog wrong while opening a file, pulls an idle sync forward. */
@TestPropertySource(properties = {"app.hub.catalog-enabled=true", "app.hub.operations-enabled=true",
    "app.hub.worker-enabled=false", "app.hub.direct-read-enabled=false"})
class CatalogNudgeIntegrationTest extends ApiIntegrationTestSupport {
  @Autowired CatalogStore catalog;
  @Autowired CatalogWorker worker;
  @Autowired ReadAuthorizationService reads;
  @Autowired ProviderConnectionRepository connections;
  @Autowired JdbcTemplate jdbc;
  @MockitoBean CloudProviderClients clients;
  @MockitoBean ProviderRetryService retry;
  private CloudProviderClient remote;
  private ProviderConnectionEntity connection;
  private String token;

  @BeforeEach void setup() throws Exception {
    var registered = registerUser("catalog_nudge", "password123", UUID.randomUUID()).path("data");
    token = registered.path("accessToken").asText();
    connection = new ProviderConnectionEntity();
    connection.setUserId(UUID.fromString(registered.path("user").path("id").asText()));
    connection.setProvider("onedrive"); connection.setAccountId("remote-account");
    connection.setEncryptedRefreshToken("unused"); connection.setConnectedAt(OffsetDateTime.now());
    connection = connections.saveAndFlush(connection);
    remote = mock(CloudProviderClient.class, withSettings().extraInterfaces(CloudSyncClient.class));
    when(remote.provider()).thenReturn(CloudProvider.ONEDRIVE);
    when(remote.readPlan(any())).thenReturn(new ReadPlan(ReadMode.NONE, ContentVariant.ORIGINAL, null));
    when(clients.get(CloudProvider.ONEDRIVE)).thenReturn(remote);
    when(retry.withRetry(any(), any())).thenAnswer(call -> ((ProviderRetryService.TokenCall<?>) call.getArgument(1)).execute("fixture-token"));
    when(((CloudSyncClient) remote).syncPage(any(), any())).thenReturn(
        new SyncPage(List.of(CloudChange.upsert(file("etag-1"))), "checkpoint-1", true, "root-id"));
    catalog.ensure(connection);
    catalog.schedule(connection.getId());
    worker.sync(connection);
    assertThat(nextRun()).isAfter(OffsetDateTime.now().plusMinutes(1));
  }

  @Test void listingRightAfterASyncKeepsTheSchedule() throws Exception {
    list();
    assertThat(nextRun()).isAfter(OffsetDateTime.now().plusMinutes(1));
  }

  @Test void listingAnIdleConnectionPullsTheNextSyncForward() throws Exception {
    syncedAgo(60);
    list();
    assertThat(nextRun()).isBeforeOrEqualTo(OffsetDateTime.now());
  }

  @Test void listingNeverCutsAFailureBackoff() throws Exception {
    syncedAgo(60);
    jdbc.update("UPDATE cloud_catalog_state SET failures=1 WHERE connection_id=?", connection.getId().toString());
    list();
    assertThat(nextRun()).isAfter(OffsetDateTime.now().plusMinutes(1));
  }

  @Test void openingAFileTheProviderNoLongerHasPullsTheNextSyncForward() {
    syncedAgo(60);
    when(remote.get(any(), eq("file-1"))).thenThrow(new ProviderApiException(HttpStatus.NOT_FOUND, "ITEM_NAO_ENCONTRADO", "Não encontrado."));
    assertThatThrownBy(() -> reads.describe(connection, remote, "file-1")).isInstanceOf(ProviderApiException.class);
    assertThat(nextRun()).isBeforeOrEqualTo(OffsetDateTime.now());
  }

  @Test void openingAFileThatChangedPullsTheNextSyncForward() {
    syncedAgo(60);
    when(remote.get(any(), eq("file-1"))).thenReturn(file("etag-2"));
    reads.describe(connection, remote, "file-1");
    assertThat(nextRun()).isBeforeOrEqualTo(OffsetDateTime.now());
  }

  @Test void openingAnUnchangedFileKeepsTheSchedule() {
    syncedAgo(60);
    when(remote.get(any(), eq("file-1"))).thenReturn(file("etag-1"));
    reads.describe(connection, remote, "file-1");
    assertThat(nextRun()).isAfter(OffsetDateTime.now().plusMinutes(1));
  }

  private static CloudItem file(String version) {
    return new CloudItem("file-1", "onedrive", "Example.txt", ItemKind.FILE, "text/plain", "txt", 8L,
        OffsetDateTime.now(), null, true, version, "content-" + version);
  }

  private void list() throws Exception {
    mockMvc.perform(get("/api/providers/onedrive/items").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
  }

  private void syncedAgo(long seconds) {
    jdbc.update("UPDATE cloud_catalog_state SET synced_at=? WHERE connection_id=?", OffsetDateTime.now().minusSeconds(seconds), connection.getId().toString());
  }

  private OffsetDateTime nextRun() {
    return jdbc.queryForObject("SELECT next_run FROM cloud_catalog_state WHERE connection_id=?", OffsetDateTime.class, connection.getId().toString());
  }
}
