package com.bridgit.api.hub;

import com.bridgit.api.common.error.BadRequestException;
import com.bridgit.api.common.security.AuthenticatedUserService;
import com.bridgit.api.hub.HubDtos.HubEntry;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionRepository;
import com.bridgit.api.integrations.ProviderConnectionService;
import com.bridgit.api.integrations.ProviderRetryService;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClient;
import com.bridgit.api.providers.CloudProviderClients;
import com.bridgit.api.providers.ItemKind;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HubService {

  @org.springframework.beans.factory.annotation.Autowired(required = false)
  private com.bridgit.api.catalog.CatalogStore catalog;
  @org.springframework.beans.factory.annotation.Autowired(required = false)
  private com.bridgit.api.catalog.LocalHubProperties localHubProperties;
  @org.springframework.beans.factory.annotation.Autowired(required = false)
  private com.bridgit.api.catalog.HubEventStore events;

  private static final int RECENT_LIMIT = 12;

  private final HubRecentRepository recentRepository;
  private final HubShortcutRepository shortcutRepository;
  private final ProviderConnectionRepository connectionRepository;
  private final ProviderConnectionService connectionService;
  private final ProviderRetryService retryService;
  private final CloudProviderClients providerClients;
  private final AuthenticatedUserService authenticatedUserService;
  private final Clock clock;

  public HubService(
      HubRecentRepository recentRepository,
      HubShortcutRepository shortcutRepository,
      ProviderConnectionRepository connectionRepository,
      ProviderConnectionService connectionService,
      ProviderRetryService retryService,
      CloudProviderClients providerClients,
      AuthenticatedUserService authenticatedUserService,
      Clock clock
  ) {
    this.recentRepository = recentRepository;
    this.shortcutRepository = shortcutRepository;
    this.connectionRepository = connectionRepository;
    this.connectionService = connectionService;
    this.retryService = retryService;
    this.providerClients = providerClients;
    this.authenticatedUserService = authenticatedUserService;
    this.clock = clock;
  }

  // No surrounding transaction: a catalog lookup that fails must not roll back the list it decorates.
  public List<HubEntry> listRecents() {
    UUID userId = authenticatedUserService.requireUserId();
    Set<UUID> connectionIds = activeConnectionIds(userId);
    if (connectionIds.isEmpty()) {
      return List.of();
    }

    List<HubRecentEntity> recents =
        recentRepository.findTop12ByUserIdAndConnectionIdInOrderByOpenedAtDesc(userId, connectionIds);
    Map<UUID, Map<String, CloudItem>> known = knownItems(userId, recents);
    return recents.stream()
        .map(recent -> toRecentEntry(
            recent,
            connectionProvider(recent.getConnectionId()),
            known.getOrDefault(recent.getConnectionId(), Map.of()).get(recent.getItemRef())))
        .toList();
  }

  // The catalog's revision lets the home grid keep a file's preview across reloads.
  // A catalog that cannot answer leaves the entry without one; the list itself never fails for it.
  private Map<UUID, Map<String, CloudItem>> knownItems(UUID userId, List<HubRecentEntity> recents) {
    if (catalog == null || localHubProperties == null || !localHubProperties.isCatalogEnabled() || recents.isEmpty()) {
      return Map.of();
    }
    Map<UUID, List<String>> refs = recents.stream().collect(Collectors.groupingBy(
        HubRecentEntity::getConnectionId, Collectors.mapping(HubRecentEntity::getItemRef, Collectors.toList())));
    Map<UUID, Map<String, CloudItem>> found = new HashMap<>();
    for (ProviderConnectionEntity connection : connectionRepository.findByUserId(userId)) {
      List<String> connectionRefs = refs.get(connection.getId());
      if (connectionRefs == null || !localHubProperties.providerEnabled(connection.getProvider())) continue;
      try {
        found.put(connection.getId(), catalog.known(connection, connectionRefs));
      } catch (RuntimeException ex) {
        // Stale generation or catalog unavailable: the entries go out without a revision.
      }
    }
    return found;
  }

  @Transactional
  public HubEntry addRecent(CloudProvider provider, String ref) {
    UUID userId = authenticatedUserService.requireUserId();
    ProviderConnectionEntity connection = connectionService.requireConnection(userId, provider);
    CloudItem item = fetchFileItem(provider, connection, ref, "RECENTE_APENAS_ARQUIVO", "Somente arquivos podem ser adicionados aos recentes.");

    OffsetDateTime now = OffsetDateTime.now(clock);

    HubRecentEntity recent = recentRepository.findByConnectionIdAndItemRef(connection.getId(), ref)
        .orElseGet(HubRecentEntity::new);
    recent.setUserId(userId);
    recent.setConnectionId(connection.getId());
    recent.setItemRef(ref);
    recent.setName(item.name());
    recent.setMimeType(item.mimeType());
    recent.setExtension(item.extension());
    recent.setOpenedAt(now);
    recentRepository.save(recent);

    trimRecents(userId);
    notifyEntry(userId, connection, "recent", ref, false);
    return toRecentEntry(recent, provider.id(), item);
  }

  @Transactional(readOnly = true)
  public List<HubEntry> listShortcuts() {
    UUID userId = authenticatedUserService.requireUserId();
    return shortcutRepository.findByUserIdOrderByPinnedAtDesc(userId).stream()
        .map(shortcut -> toShortcutEntry(shortcut, connectionProvider(shortcut.getConnectionId())))
        .toList();
  }

  @Transactional
  public HubEntry upsertShortcut(CloudProvider provider, String ref) {
    UUID userId = authenticatedUserService.requireUserId();
    ProviderConnectionEntity connection = connectionService.requireConnection(userId, provider);
    CloudItem item = fetchItem(provider, connection, ref);

    OffsetDateTime now = OffsetDateTime.now(clock);

    HubShortcutEntity shortcut = shortcutRepository.findByConnectionIdAndItemRef(connection.getId(), ref)
        .orElseGet(HubShortcutEntity::new);
    if (shortcut.getPinnedAt() == null) {
      shortcut.setPinnedAt(now);
    }
    shortcut.setUserId(userId);
    shortcut.setConnectionId(connection.getId());
    shortcut.setItemRef(ref);
    shortcut.setName(item.name());
    shortcut.setMimeType(item.mimeType());
    shortcut.setExtension(item.extension());
    shortcutRepository.save(shortcut);
    notifyShortcut(userId, connection, ref, false);

    return toShortcutEntry(shortcut, provider.id());
  }

  @Transactional
  public void deleteShortcut(CloudProvider provider, String ref) {
    UUID userId = authenticatedUserService.requireUserId();
    connectionRepository.findByUserIdAndProvider(userId, provider.id()).ifPresent(connection ->
        shortcutRepository.findByConnectionIdAndItemRef(connection.getId(), ref).ifPresent(shortcut -> {
          shortcutRepository.delete(shortcut);
          notifyShortcut(userId, connection, ref, true);
        }));
  }

  private void notifyShortcut(UUID userId, ProviderConnectionEntity connection, String ref, boolean removed) {
    notifyEntry(userId, connection, "shortcut", ref, removed);
  }

  // Other devices refresh on hub events; without one a shortcut or recent made elsewhere stays invisible.
  // Clients reload only their home lists on these, so a recent does not reload the file being read.
  private void notifyEntry(UUID userId, ProviderConnectionEntity connection, String entry, String ref, boolean removed) {
    if (events == null) return;
    events.append(userId, connection.getId(), connection.getGeneration(), "hub_entries",
        java.util.Map.of("entry", entry, "ref", ref, "removed", removed));
  }

  private CloudItem fetchFileItem(
      CloudProvider provider,
      ProviderConnectionEntity connection,
      String ref,
      String errorCode,
      String errorMessage
  ) {
    CloudItem item = fetchItem(provider, connection, ref);
    if (item.kind() == ItemKind.FOLDER) {
      throw new BadRequestException(errorCode, errorMessage);
    }
    return item;
  }

  private CloudItem fetchItem(CloudProvider provider, ProviderConnectionEntity connection, String ref) {
    if (catalog != null && localHubProperties != null && localHubProperties.isCatalogEnabled()
        && localHubProperties.providerEnabled(provider.id())) {
      var known = catalog.entry(connection, ref);
      if (known != null && !known.deleted()) return known.item();
    }
    CloudProviderClient client = providerClients.get(provider);
    return retryService.withRetry(connection, token -> client.get(token, ref));
  }

  private void trimRecents(UUID userId) {
    List<HubRecentEntity> recents = recentRepository.findByUserIdOrderByOpenedAtDesc(userId);
    if (recents.size() > RECENT_LIMIT) {
      recentRepository.deleteAll(recents.subList(RECENT_LIMIT, recents.size()));
    }
  }

  private Set<UUID> activeConnectionIds(UUID userId) {
    return connectionRepository.findByUserId(userId).stream()
        .map(ProviderConnectionEntity::getId)
        .collect(Collectors.toSet());
  }

  private String connectionProvider(UUID connectionId) {
    return connectionRepository.findById(connectionId)
        .map(ProviderConnectionEntity::getProvider)
        .orElse(null);
  }

  static HubEntry toRecentEntry(HubRecentEntity entity, String provider, CloudItem known) {
    return new HubEntry(
        provider,
        entity.getItemRef(),
        entity.getName(),
        entity.getMimeType(),
        entity.getExtension(),
        entity.getOpenedAt(),
        null,
        known == null ? null : known.contentRevision(),
        known == null ? null : known.remoteVersion()
    );
  }

  static HubEntry toShortcutEntry(HubShortcutEntity entity, String provider) {
    return new HubEntry(
        provider,
        entity.getItemRef(),
        entity.getName(),
        entity.getMimeType(),
        entity.getExtension(),
        null,
        entity.getPinnedAt(),
        null,
        null
    );
  }
}
