package com.bridgit.api.hub;

import com.bridgit.api.links.PublicLinkRepository;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudItemChangedEvent;
import com.bridgit.api.providers.CloudItemDeletedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class HubItemEventListener {

  private final HubRecentRepository recentRepository;
  private final HubShortcutRepository shortcutRepository;
  private final PublicLinkRepository publicLinkRepository;

  public HubItemEventListener(
      HubRecentRepository recentRepository,
      HubShortcutRepository shortcutRepository,
      PublicLinkRepository publicLinkRepository
  ) {
    this.recentRepository = recentRepository;
    this.shortcutRepository = shortcutRepository;
    this.publicLinkRepository = publicLinkRepository;
  }

  @EventListener
  @Transactional
  public void onItemChanged(CloudItemChangedEvent event) {
    CloudItem item = event.item();
    recentRepository.updateSnapshot(
        event.connectionId(),
        item.ref(),
        item.name(),
        item.mimeType(),
        item.extension()
    );
    shortcutRepository.updateSnapshot(
        event.connectionId(),
        item.ref(),
        item.name(),
        item.mimeType(),
        item.extension()
    );
    publicLinkRepository.updateSnapshot(
        event.connectionId(),
        item.ref(),
        item.name(),
        item.mimeType(),
        item.extension(),
        item.size()
    );
  }

  @EventListener
  @Transactional
  public void onItemDeleted(CloudItemDeletedEvent event) {
    recentRepository.deleteByConnectionIdAndItemRef(event.connectionId(), event.ref());
    shortcutRepository.deleteByConnectionIdAndItemRef(event.connectionId(), event.ref());
    publicLinkRepository.deleteByConnectionIdAndItemRef(event.connectionId(), event.ref());
  }
}
