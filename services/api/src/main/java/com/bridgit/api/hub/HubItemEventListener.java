package com.bridgit.api.hub;

import com.bridgit.api.links.PublicLinkRepository;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudItemChangedEvent;
import com.bridgit.api.providers.CloudItemDeletedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class HubItemEventListener {

  private static final Logger logger = LoggerFactory.getLogger(HubItemEventListener.class);

  private final HubRecentRepository recentRepository;
  private final HubShortcutRepository shortcutRepository;
  private final PublicLinkRepository publicLinkRepository;
  private final TransactionTemplate requiresNewTemplate;

  public HubItemEventListener(
      HubRecentRepository recentRepository,
      HubShortcutRepository shortcutRepository,
      PublicLinkRepository publicLinkRepository,
      PlatformTransactionManager transactionManager
  ) {
    this.recentRepository = recentRepository;
    this.shortcutRepository = shortcutRepository;
    this.publicLinkRepository = publicLinkRepository;
    this.requiresNewTemplate = new TransactionTemplate(transactionManager);
    this.requiresNewTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }

  @EventListener
  public void onItemChanged(CloudItemChangedEvent event) {
    try {
      requiresNewTemplate.executeWithoutResult(status -> applyItemChanged(event));
    } catch (Exception first) {
      try {
        requiresNewTemplate.executeWithoutResult(status -> applyItemChanged(event));
      } catch (Exception second) {
        logger.warn(
            "Nao foi possivel atualizar os atalhos locais connectionId={} ref={}",
            event.connectionId(),
            event.item().ref(),
            second
        );
        LocalSyncFlag.markPending();
      }
    }
  }

  private void applyItemChanged(CloudItemChangedEvent event) {
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
  public void onItemDeleted(CloudItemDeletedEvent event) {
    try {
      requiresNewTemplate.executeWithoutResult(status -> applyItemDeleted(event));
    } catch (Exception first) {
      try {
        requiresNewTemplate.executeWithoutResult(status -> applyItemDeleted(event));
      } catch (Exception second) {
        logger.warn(
            "Nao foi possivel remover os atalhos locais connectionId={} ref={}",
            event.connectionId(),
            event.ref(),
            second
        );
        LocalSyncFlag.markPending();
      }
    }
  }

  private void applyItemDeleted(CloudItemDeletedEvent event) {
    recentRepository.deleteByConnectionIdAndItemRef(event.connectionId(), event.ref());
    shortcutRepository.deleteByConnectionIdAndItemRef(event.connectionId(), event.ref());
    publicLinkRepository.deleteByConnectionIdAndItemRef(event.connectionId(), event.ref());
  }
}
