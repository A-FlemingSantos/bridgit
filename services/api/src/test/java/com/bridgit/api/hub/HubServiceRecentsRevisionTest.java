package com.bridgit.api.hub;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.bridgit.api.catalog.CatalogStore;
import com.bridgit.api.catalog.LocalHubProperties;
import com.bridgit.api.common.security.AuthenticatedUserService;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionRepository;
import com.bridgit.api.integrations.ProviderConnectionService;
import com.bridgit.api.integrations.ProviderRetryService;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudProviderClients;
import com.bridgit.api.providers.ItemKind;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class HubServiceRecentsRevisionTest {

  @Test
  void recentCarriesTheCatalogRevision() {
    Harness harness = harness();
    CloudItem item = new CloudItem("photo", "onedrive", "a.jpg", ItemKind.FILE, "image/jpeg", "jpg", 10L,
        null, null, true, "etag-1", "ctag-1");
    when(harness.catalog.known(any(), anyCollection())).thenReturn(Map.of("photo", item));

    HubDtos.HubEntry entry = harness.service.listRecents().getFirst();

    assertEquals("ctag-1", entry.contentRevision());
    assertEquals("etag-1", entry.remoteVersion());
  }

  @Test
  void recentStillListsWhenTheCatalogCannotAnswer() {
    Harness harness = harness();
    when(harness.catalog.known(any(), anyCollection())).thenThrow(new IllegalStateException("stale"));

    HubDtos.HubEntry entry = harness.service.listRecents().getFirst();

    assertEquals("photo", entry.ref());
    assertNull(entry.contentRevision());
  }

  private static Harness harness() {
    UUID userId = UUID.randomUUID();
    ProviderConnectionEntity connection = new ProviderConnectionEntity();
    connection.setId(UUID.randomUUID());
    connection.setUserId(userId);
    connection.setProvider("onedrive");

    HubRecentEntity recent = new HubRecentEntity();
    recent.setUserId(userId);
    recent.setConnectionId(connection.getId());
    recent.setItemRef("photo");
    recent.setName("a.jpg");
    recent.setOpenedAt(OffsetDateTime.now());

    AuthenticatedUserService auth = mock(AuthenticatedUserService.class);
    when(auth.requireUserId()).thenReturn(userId);
    ProviderConnectionRepository connections = mock(ProviderConnectionRepository.class);
    when(connections.findByUserId(userId)).thenReturn(List.of(connection));
    when(connections.findById(connection.getId())).thenReturn(Optional.of(connection));
    HubRecentRepository recents = mock(HubRecentRepository.class);
    when(recents.findTop12ByUserIdAndConnectionIdInOrderByOpenedAtDesc(userId, Set.of(connection.getId())))
        .thenReturn(List.of(recent));

    HubService service = new HubService(
        recents,
        mock(HubShortcutRepository.class),
        connections,
        mock(ProviderConnectionService.class),
        mock(ProviderRetryService.class),
        mock(CloudProviderClients.class),
        auth,
        Clock.systemUTC()
    );
    CatalogStore catalog = mock(CatalogStore.class);
    LocalHubProperties properties = new LocalHubProperties();
    properties.setCatalogEnabled(true);
    ReflectionTestUtils.setField(service, "catalog", catalog);
    ReflectionTestUtils.setField(service, "localHubProperties", properties);
    return new Harness(service, catalog);
  }

  private record Harness(HubService service, CatalogStore catalog) {
  }
}
