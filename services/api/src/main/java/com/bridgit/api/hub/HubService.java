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
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HubService {

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

  @Transactional(readOnly = true)
  public List<HubEntry> listRecents() {
    UUID userId = authenticatedUserService.requireUserId();
    Set<UUID> connectionIds = activeConnectionIds(userId);
    if (connectionIds.isEmpty()) {
      return List.of();
    }

    return recentRepository.findTop12ByUserIdAndConnectionIdInOrderByOpenedAtDesc(userId, connectionIds).stream()
        .map(recent -> toRecentEntry(recent, connectionProvider(recent.getConnectionId())))
        .toList();
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
    return toRecentEntry(recent, provider.id());
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

    return toShortcutEntry(shortcut, provider.id());
  }

  @Transactional
  public void deleteShortcut(CloudProvider provider, String ref) {
    UUID userId = authenticatedUserService.requireUserId();
    connectionRepository.findByUserIdAndProvider(userId, provider.id())
        .flatMap(connection -> shortcutRepository.findByConnectionIdAndItemRef(connection.getId(), ref))
        .ifPresent(shortcutRepository::delete);
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

  static HubEntry toRecentEntry(HubRecentEntity entity, String provider) {
    return new HubEntry(
        provider,
        entity.getItemRef(),
        entity.getName(),
        entity.getMimeType(),
        entity.getExtension(),
        entity.getOpenedAt(),
        null
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
        entity.getPinnedAt()
    );
  }
}
