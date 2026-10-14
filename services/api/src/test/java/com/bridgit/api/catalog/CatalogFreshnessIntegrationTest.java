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

/** The listing says whether a catalog answer may be behind (Findings 2). */
@TestPropertySource(properties = {"app.hub.catalog-enabled=true", "app.hub.operations-enabled=true",
    "app.hub.worker-enabled=false", "app.hub.direct-read-enabled=false"})
class CatalogFreshnessIntegrationTest extends ApiIntegrationTestSupport {
  @Autowired CatalogStore catalog;
  @Autowired CatalogWorker worker;
  @Autowired ProviderConnectionRepository connections;
  @MockitoBean CloudProviderClients clients;
  @MockitoBean ProviderRetryService retry;
  private CloudProviderClient remote;
  private CloudSyncClient feed;
  private ProviderConnectionEntity connection;
  private String token;

  @BeforeEach void setup() throws Exception {
    var registered = registerUser("catalog_freshness", "password123", UUID.randomUUID()).path("data");
    UUID user = UUID.fromString(registered.path("user").path("id").asText());
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
    CloudItem file = new CloudItem("file-1", "onedrive", "Example.txt", ItemKind.FILE, "text/plain", "txt", 8L,
        OffsetDateTime.now(), null, true, "etag-1", "content-1");
    when(feed.syncPage(any(), any())).thenReturn(
        new SyncPage(List.of(CloudChange.upsert(file)), "checkpoint-1", true, "root-id"));
    catalog.ensure(connection);
    catalog.schedule(connection.getId());
    worker.sync(connection);
  }

  @Test void catalogListingIsCurrentAfterASuccessfulSync() throws Exception {
    mockMvc.perform(get("/api/providers/onedrive/items").header("Authorization", "Bearer " + token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.items[0].ref").value("file-1"))
        .andExpect(jsonPath("$.data.catalog.freshness").value("current"))
        .andExpect(jsonPath("$.data.catalog.staleReason").doesNotExist())
        .andExpect(jsonPath("$.data.catalog.syncedAt").isNotEmpty());
  }

  @Test void catalogListingIsStaleWhileTheProviderNeedsReconnecting() throws Exception {
    connection.setLastError("RECONEXAO_NECESSARIA");
    connections.saveAndFlush(connection);

    mockMvc.perform(get("/api/providers/onedrive/items").header("Authorization", "Bearer " + token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.items[0].ref").value("file-1"))
        .andExpect(jsonPath("$.data.catalog.freshness").value("stale"))
        .andExpect(jsonPath("$.data.catalog.staleReason").value("RECONEXAO_NECESSARIA"));
  }

  @Test void catalogListingIsStaleWhenTheSyncKeepsFailing() throws Exception {
    when(feed.syncPage(any(), any())).thenThrow(new ProviderApiException(HttpStatus.SERVICE_UNAVAILABLE, "PROVEDOR_INDISPONIVEL", "Fora do ar."));
    for (int i = 0; i < 2; i++) {
      catalog.schedule(connection.getId());
      worker.sync(connection);
    }

    mockMvc.perform(get("/api/providers/onedrive/items").header("Authorization", "Bearer " + token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.catalog.freshness").value("stale"))
        .andExpect(jsonPath("$.data.catalog.staleReason").value("PROVEDOR_INDISPONIVEL"));
  }
}
