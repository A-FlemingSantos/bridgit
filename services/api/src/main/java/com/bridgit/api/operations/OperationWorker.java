package com.bridgit.api.operations;

import com.bridgit.api.catalog.*;
import com.bridgit.api.common.error.ApiException;
import com.bridgit.api.integrations.*;
import com.bridgit.api.providers.*;
import com.bridgit.api.providers.sync.PreparedWrite;
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

@Component
public class OperationWorker {
  private static final Logger log = LoggerFactory.getLogger(OperationWorker.class);
  private final OperationStore store;
  private final UploadPayloadStore payloads;
  private final ProviderConnectionRepository connections;
  private final ProviderRetryService retry;
  private final CloudProviderClients clients;
  private final ConnectionWork work;
  private final LocalHubProperties properties;
  private final Clock clock;
  private final ExecutorService executor = Executors.newFixedThreadPool(4);
  private final Set<UUID> active = ConcurrentHashMap.newKeySet();
  public OperationWorker(OperationStore store, UploadPayloadStore payloads, ProviderConnectionRepository connections,
      ProviderRetryService retry, CloudProviderClients clients, ConnectionWork work, LocalHubProperties properties, Clock clock) {
    this.store = store; this.payloads = payloads; this.connections = connections; this.retry = retry; this.clients = clients;
    this.work = work; this.properties = properties; this.clock = clock;
  }
  @Scheduled(fixedDelayString = "${app.hub.operation-poll-ms:500}")
  public void tick() {
    if (!properties.isWorkerEnabled()) return; // Already accepted operations survive disabling new submissions.
    for (OperationStore.Stored op : store.due()) {
      if (active.size() >= 4) break;
      if (!active.add(op.connectionId())) continue;
      executor.submit(() -> { try { execute(op.id()); } finally { active.remove(op.connectionId()); } });
    }
    for (OperationStore.Stored op : store.finishedPayloads()) {
      try { payloads.remove(op.payload()); store.payloadRemoved(op.id()); }
      catch (RuntimeException ex) { log.warn("Completed upload cleanup deferred operation={}", op.id()); }
    }
  }

  public void execute(UUID id) {
    OperationStore.Stored initial = store.get(id);
    if (initial == null) return;
    ReentrantLock lock = work.lock(initial.connectionId());
    if (!lock.tryLock()) return;
    String owner = UUID.randomUUID().toString();
    boolean dispatched = false;
    boolean claimed = false;
    OperationStore.Stored op = initial;
    try {
      if (!store.claim(id, owner)) return;
      claimed = true;
      op = store.get(id);
      ProviderConnectionEntity c = connections.findById(op.connectionId()).orElse(null);
      if (c == null || !c.getUserId().equals(op.userId())) {
        store.defer(id, owner, "REJECTED", 0, "CONEXAO_ALTERADA", "A conexao mudou. Esta operacao nao foi aplicada a outra conta."); return;
      }
      if (c.getGeneration() != op.generation()) op = store.reconnect(op, owner, c);
      CloudProviderClient client = clients.get(CloudProvider.fromId(c.getProvider()));
      if ("VERIFYING".equals(op.status())) { verify(op, c, client, owner); return; }
      OperationDtos.Request r = op.request();
      String parent = r.parentRef();
      if (r.dependencyId() != null) {
        OperationStore.Stored dependency = store.require(op.userId(), r.dependencyId());
        if ("REJECTED".equals(dependency.status()) || "NEEDS_ATTENTION".equals(dependency.status())) {
          store.defer(id, owner, "NEEDS_ATTENTION", 0, "DESTINO_PENDENTE", "Resolva a criacao do destino antes de continuar."); return;
        }
        if (!"SUCCEEDED".equals(dependency.status())) { store.defer(id, owner, "QUEUED", 1, null, null); return; }
        if (dependency.result() == null || dependency.result().kind() != ItemKind.FOLDER) throw new ApiException(HttpStatus.CONFLICT, "DESTINO_INVALIDO", "O destino nao e uma pasta.");
        parent = dependency.result().ref();
      }
      if (r.kind() != OperationDtos.Kind.UPDATE && parent != null && parent.isBlank()) parent = null;
      store.beginAttempt(id, owner);
      CloudItem base = op.base();
      if (base == null && (r.kind() == OperationDtos.Kind.UPDATE || r.kind() == OperationDtos.Kind.DELETE)) {
        base = retry.withRetry(c, token -> client.get(token, r.ref()));
        if (r.expectedVersion() != null && !r.expectedVersion().equals(base.remoteVersion())) throw new ApiException(HttpStatus.CONFLICT, "ARQUIVO_ALTERADO", "O arquivo foi alterado. Atualize antes de tentar novamente.");
      }
      PreparedWrite prepared = op.prepared();
      if (prepared == null && (r.kind() == OperationDtos.Kind.CREATE_FOLDER || r.kind() == OperationDtos.Kind.UPLOAD)) prepared = retry.withRetry(c, client::prepareCreate);
      store.prepared(id, owner, prepared, base);
      final PreparedWrite preparation = prepared;
      final String destination = parent;
      final String name = keepExtension(r.name(), base);
      final String version = base == null ? r.expectedVersion() : base.remoteVersion();
      final org.springframework.core.io.InputStreamSource upload = r.kind() == OperationDtos.Kind.UPLOAD ? payloads.verified(op.payload()) : null;
      final long size = op.payload() == null ? 0 : op.payload().size();
      store.executing(id, owner);
      dispatched = true;
      CloudItem result = switch (r.kind()) {
        case CREATE_FOLDER -> retry.withRetry(c, token -> client.createFolderPrepared(token, destination, r.name(), preparation));
        case UPLOAD -> retry.withRetry(c, token -> client.uploadPrepared(token, destination, r.name(), r.contentType(), size, upload, preparation));
        case UPDATE -> retry.withRetry(c, token -> client.updateConditional(token, r.ref(), name, destination, version));
        case DELETE -> retry.withRetry(c, token -> { client.deleteConditional(token, r.ref(), version); return null; });
      };
      store.success(op, owner, c, result, r.kind() == OperationDtos.Kind.DELETE ? r.ref() : null);
    } catch (Exception ex) {
      if (!claimed) return;
      String code = ex instanceof ApiException api ? api.getCode() : "OPERACAO_FALHOU";
      String message = ex instanceof ApiException api ? api.getMessage() : "Nao foi possivel confirmar a operacao. O resultado sera verificado.";
      int status = ex instanceof ApiException api ? api.getStatus().value() : 0;
      String next;
      if ("VERIFYING".equals(op.status())) next = status == 403 ? "NEEDS_ATTENTION" : "VERIFYING";
      else if (status == 401 || "PROVEDOR_RECONECTAR".equals(code)) next = "WAITING_RECONNECT";
      else if (status == 429) next = op.attempts() >= 4 ? "NEEDS_ATTENTION" : "QUEUED";
      else if (status >= 400 && status < 500) next = "REJECTED";
      else next = dispatched || "VERIFYING".equals(op.status()) ? "VERIFYING" : op.attempts() >= 4 ? "NEEDS_ATTENTION" : "QUEUED";
      long delay = ex instanceof ProviderApiException api && api.getRetryAfterSeconds() != null ? Math.max(1, api.getRetryAfterSeconds()) : Math.min(300, (1L << Math.min(8, op.attempts())) * 2) + ThreadLocalRandom.current().nextLong(3);
      try { store.defer(id, owner, next, delay, code, message); }
      catch (Exception persistence) { log.warn("Operation recovery will resume expired lease id={}", id); }
    } finally { lock.unlock(); }
  }

  private void verify(OperationStore.Stored op, ProviderConnectionEntity c, CloudProviderClient client, String owner) {
    OperationDtos.Request r = op.request();
    String ref = r.ref() != null ? r.ref() : op.prepared() == null ? null : op.prepared().remoteRef();
    if (ref != null) {
      try {
        CloudItem current = retry.withRetry(c, token -> client.get(token, ref));
        boolean confirmed = switch (r.kind()) {
          case CREATE_FOLDER -> current.kind() == ItemKind.FOLDER;
          case UPLOAD -> Objects.equals(current.size(), op.payload() == null ? null : op.payload().size());
          case UPDATE -> (r.name() == null || Objects.equals(current.name(), keepExtension(r.name(), op.base())))
              && (r.parentRef() == null || Objects.equals(current.parentRef(), r.parentRef().isBlank() ? null : r.parentRef()));
          case DELETE -> false;
        };
        if (confirmed) { store.success(op, owner, c, current, null); return; }
      } catch (ProviderApiException ex) {
        if (ex.getStatus() != HttpStatus.NOT_FOUND) throw ex;
        if (r.kind() == OperationDtos.Kind.DELETE) { store.success(op, owner, c, null, r.ref()); return; }
        if (op.prepared() != null && op.prepared().remoteRef() != null) {
          store.defer(op.id(), owner, "QUEUED", 2, null, null); return; // provider-assigned creation ID is retry-safe
        }
      }
    }
    boolean expired = op.createdAt().isBefore(OffsetDateTime.now(clock).minusMinutes(15));
    store.defer(op.id(), owner, expired ? "NEEDS_ATTENTION" : "VERIFYING", 30,
        "RESULTADO_NAO_CONFIRMADO", "Nao foi possivel confirmar o resultado. Atualize antes de repetir a operacao.");
  }
  static String keepExtension(String name, CloudItem current) {
    if (name == null || current == null || current.kind() != ItemKind.FILE || current.extension() == null || current.extension().isBlank()) return name;
    int dot = name.lastIndexOf('.');
    return dot > 0 && dot < name.length() - 1 ? name : name + "." + current.extension();
  }
  @PreDestroy public void close() { executor.shutdownNow(); }
}
