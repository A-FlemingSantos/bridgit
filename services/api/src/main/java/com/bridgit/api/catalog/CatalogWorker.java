package com.bridgit.api.catalog;

import com.bridgit.api.integrations.*;
import com.bridgit.api.providers.*;
import com.bridgit.api.providers.sync.*;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.locks.ReentrantLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class CatalogWorker {
  private static final Logger log = LoggerFactory.getLogger(CatalogWorker.class);
  private final ProviderConnectionRepository connections;
  private final CloudProviderClients clients;
  private final ProviderRetryService retry;
  private final CatalogStore store;
  private final LocalHubProperties properties;
  private final ConnectionWork work;
  private final Clock clock;
  private final ExecutorService executor = Executors.newFixedThreadPool(4);
  private final Set<UUID> running = ConcurrentHashMap.newKeySet();
  private final String instance = UUID.randomUUID().toString();

  public CatalogWorker(ProviderConnectionRepository connections, CloudProviderClients clients, ProviderRetryService retry,
      CatalogStore store, LocalHubProperties properties, ConnectionWork work, Clock clock) {
    this.connections = connections; this.clients = clients; this.retry = retry; this.store = store;
    this.properties = properties; this.work = work; this.clock = clock;
  }

  @Scheduled(fixedDelayString = "${app.hub.worker-poll-ms:2000}")
  public void tick() {
    if (!properties.isWorkerEnabled() || !properties.isCatalogEnabled()) return;
    for (UUID connectionId : store.dueConnections()) {
      ProviderConnectionEntity c = connections.findById(connectionId).orElse(null);
      if (c == null) continue;
      if (!properties.providerEnabled(c.getProvider())) continue;
      if (running.size() >= 4) break;
      if (!(clients.get(CloudProvider.fromId(c.getProvider())) instanceof CloudSyncClient)) continue;
      if (!running.add(c.getId())) continue;
      executor.submit(() -> { try { sync(c); } finally { running.remove(c.getId()); } });
    }
  }

  // Runs once the change that made the sync due is committed; the poll above stays as the fallback.
  @TransactionalEventListener(fallbackExecution = true)
  public void onSyncDue(CatalogStore.SyncDue due) { tick(); }

  public void sync(ProviderConnectionEntity c) {
    ReentrantLock lock = work.lock(c.getId());
    if (!lock.tryLock()) return;
    String owner = instance + ":" + UUID.randomUUID();
    boolean claimed = false;
    long delay = 30;
    String error = null;
    try {
      if (!store.claim(c, owner)) return;
      claimed = true;
      CloudProviderClient client = clients.get(CloudProvider.fromId(c.getProvider()));
      if (!(client instanceof CloudSyncClient sync)) return;
      CatalogStore.State state = store.state(c.getId());
      SyncPage page = retry.withRetry(c, token -> sync.syncPage(token, state.checkpoint()));
      List<CloudChange> reconciled = new ArrayList<>();
      for (CloudChange change : page.changes()) {
        if (change.deleted() && change.ref() == null && change.path() != null) {
          // The removal clears the path; a row Bridgit wrote there may be newer than it, so ask the provider by id.
          reconciled.add(change);
          for (String ref : store.fencedAtPath(c, state.buildingScan(), change.path())) {
            try { reconciled.add(CloudChange.upsert(retry.withRetry(c, token -> client.get(token, ref)))); }
            catch (ProviderApiException ex) {
              if (ex.getStatus() != HttpStatus.NOT_FOUND) throw ex;
              reconciled.add(CloudChange.removed(ref));
            }
          }
          continue;
        }
        CatalogStore.Entry local = change.ref() != null ? store.entry(c, change.ref()) : change.path() == null ? null : store.entryByPath(c, change.path());
        // An entry with neither name nor kind is how a removal looks once the deleted facet is lost; confirm it.
        boolean incomplete = !change.deleted() && change.ref() != null && (change.item() == null
            || local == null && (!change.knownFields().contains("kind") || !change.knownFields().contains("name"))
            || !change.knownFields().contains("kind") && !change.knownFields().contains("name"));
        if (incomplete || local != null && local.fenced() && (change.deleted() || change.item() == null || local.item().remoteVersion() == null
            || !Objects.equals(local.item().remoteVersion(), change.item().remoteVersion()))) {
          String ref = change.ref() != null ? change.ref() : local.item().ref();
          try {
            CloudItem fresh = retry.withRetry(c, token -> client.get(token, ref));
            CloudChange full = CloudChange.upsert(fresh);
            reconciled.add(new CloudChange(ref, fresh, false, change.deleted() ? null : change.path(), change.deleted() ? null : change.parentPath(), full.knownFields()));
          } catch (ProviderApiException ex) {
            if (ex.getStatus() != HttpStatus.NOT_FOUND) throw ex;
            reconciled.add(CloudChange.removed(ref));
          }
        } else reconciled.add(change);
      }
      store.applyPage(c, owner, state, new SyncPage(reconciled, page.checkpoint(), page.caughtUp(), page.rootRef()));
      delay = !page.caughtUp() ? 0 : state.watchExpires() != null && state.watchExpires().isAfter(OffsetDateTime.now(clock)) ? 300
          : state.activeAt() != null && state.activeAt().isAfter(OffsetDateTime.now(clock).minusMinutes(2)) ? 30 : 300;
    } catch (SyncResetException ex) {
      if (claimed) store.reset(c, owner);
      delay = 1;
    } catch (Exception ex) {
      error = ex instanceof com.bridgit.api.common.error.ApiException api ? api.getCode() : "SINCRONIZACAO_FALHOU";
      CatalogStore.State failed = store.state(c.getId());
      long backoff = Math.min(900, 5L << Math.min(7, failed == null ? 0 : failed.failures()));
      delay = ex instanceof ProviderApiException api && api.getRetryAfterSeconds() != null
          ? Math.max(1, api.getRetryAfterSeconds()) : backoff + ThreadLocalRandom.current().nextLong(Math.max(1, backoff / 4));
      log.warn("Catalog sync deferred connection={} code={}", c.getId(), error);
    } finally {
      if (claimed) store.release(c, owner, delay, error);
      lock.unlock();
    }
  }
  @PreDestroy public void close() { executor.shutdownNow(); }
}
