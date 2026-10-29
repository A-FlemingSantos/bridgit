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
  private final ReadAuthorizationService readAuthorization;
  private final ExecutorService executor = Executors.newFixedThreadPool(4);
  private final Set<UUID> active = ConcurrentHashMap.newKeySet();
  public OperationWorker(OperationStore store, UploadPayloadStore payloads, ProviderConnectionRepository connections,
      ProviderRetryService retry, CloudProviderClients clients, ConnectionWork work, LocalHubProperties properties, Clock clock,
      ReadAuthorizationService readAuthorization) {
    this.store = store; this.payloads = payloads; this.connections = connections; this.retry = retry; this.clients = clients;
    this.work = work; this.properties = properties; this.clock = clock; this.readAuthorization = readAuthorization;
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
        store.defer(id, owner, "REJECTED", 0, "CONEXAO_ALTERADA", "A conexão mudou. Esta operação não foi aplicada a outra conta."); return;
      }
      if (c.getGeneration() != op.generation()) op = store.reconnect(op, owner, c);
      CloudProviderClient client = clients.get(CloudProvider.fromId(c.getProvider()));
      if ("VERIFYING".equals(op.status())) { verify(op, c, client, owner); return; }
      OperationDtos.Request r = op.request();
      String parent = r.parentRef();
      if (r.dependencyId() != null) {
        OperationStore.Stored dependency = store.require(op.userId(), r.dependencyId());
        if ("REJECTED".equals(dependency.status()) || "NEEDS_ATTENTION".equals(dependency.status())) {
          store.defer(id, owner, "NEEDS_ATTENTION", 0, "DESTINO_PENDENTE", "Resolva a criação do destino antes de continuar."); return;
        }
        if (!"SUCCEEDED".equals(dependency.status())) { store.defer(id, owner, "QUEUED", 1, null, null); return; }
        if (dependency.result() == null || dependency.result().kind() != ItemKind.FOLDER) throw new ApiException(HttpStatus.CONFLICT, "DESTINO_INVALIDO", "O destino não é uma pasta.");
        parent = dependency.result().ref();
      }
      if (r.kind() != OperationDtos.Kind.UPDATE && parent != null && parent.isBlank()) parent = null;
      store.beginAttempt(id, owner);
      CloudItem base = op.base();
      boolean replace = r.kind() == OperationDtos.Kind.REPLACE_CONTENT;
      // A content write is conditioned on the provider's current version, so its base is always read fresh.
      if ((base == null || replace) && (r.kind() == OperationDtos.Kind.UPDATE || r.kind() == OperationDtos.Kind.DELETE || replace)) {
        try {
          base = retry.withRetry(c, token -> client.get(token, r.ref()));
        } catch (ApiException ex) {
          // Deleting something that is already gone (for instance already in the provider's trash) is done.
          if (r.kind() != OperationDtos.Kind.DELETE || ex.getStatus() != HttpStatus.NOT_FOUND) throw ex;
          store.success(op, owner, c, null, r.ref());
          return;
        }
        if (replace) {
          if (!Objects.equals(r.expectedVersion(), base.contentRevision())) {
            log.warn("Operation content revision mismatch id={} provider={} ref={}", id, c.getProvider(), r.ref());
            throw ProviderHttpSupport.contentChanged();
          }
          if (!ReadPlanSupport.isEditableText(CloudProvider.fromId(c.getProvider()), base)) {
            throw new ApiException(HttpStatus.CONFLICT, "EDICAO_INDISPONIVEL", "Este arquivo não pode ser editado aqui.");
          }
        } else if (r.expectedVersion() != null && !r.expectedVersion().equals(base.remoteVersion())) {
          log.warn("Operation version mismatch id={} provider={} ref={} expected={} current={}", id, c.getProvider(), r.ref(), r.expectedVersion(), base.remoteVersion());
          throw new ApiException(HttpStatus.CONFLICT, "ARQUIVO_ALTERADO", "O arquivo foi alterado. Atualize antes de tentar novamente.");
        }
      }
      PreparedWrite prepared = op.prepared();
      if (prepared == null && (r.kind() == OperationDtos.Kind.CREATE_FOLDER || r.kind() == OperationDtos.Kind.UPLOAD)) prepared = retry.withRetry(c, client::prepareCreate);
      store.prepared(id, owner, prepared, base);
      final PreparedWrite preparation = prepared;
      final String destination = parent;
      final CloudItem baseItem = base;
      final String name = keepExtension(r.name(), base);
      final String version = base == null ? r.expectedVersion() : base.remoteVersion();
      final org.springframework.core.io.InputStreamSource upload = r.kind() == OperationDtos.Kind.UPLOAD || replace ? payloads.verified(op.payload()) : null;
      final long size = op.payload() == null ? 0 : op.payload().size();
      store.executing(id, owner);
      dispatched = true;
      CloudItem result = switch (r.kind()) {
        case CREATE_FOLDER -> retry.withRetry(c, token -> client.createFolderPrepared(token, destination, r.name(), preparation));
        case UPLOAD -> retry.withRetry(c, token -> client.uploadPrepared(token, destination, r.name(), r.contentType(), size, upload, preparation));
        case UPDATE -> retry.withRetry(c, token -> client.updateConditional(token, r.ref(), name, destination, version));
        case DELETE -> retry.withRetry(c, token -> { client.deleteConditional(token, r.ref(), version); return null; });
        case REPLACE_CONTENT -> replaceContent(c, client, r, baseItem, upload, size, version);
      };
      store.success(op, owner, c, result, r.kind() == OperationDtos.Kind.DELETE ? r.ref() : null);
      if (replace) readAuthorization.invalidate(c.getId(), r.ref());
    } catch (Exception ex) {
      if (!claimed) return;
      log.warn("Operation attempt failed id={} dispatched={}", id, dispatched, ex);
      String code = ex instanceof ApiException api ? api.getCode() : "OPERACAO_FALHOU";
      String message = ex instanceof ApiException api ? api.getMessage() : "Não foi possível confirmar a operação. O resultado será verificado.";
      int status = ex instanceof ApiException api ? api.getStatus().value() : 0;
      String next;
      if ("VERIFYING".equals(op.status())) next = status == 403 ? "NEEDS_ATTENTION" : "VERIFYING";
      else if (status == 401 || "PROVEDOR_RECONECTAR".equals(code)) next = "WAITING_RECONNECT";
      else if (status == 429) next = op.attempts() >= 4 ? "NEEDS_ATTENTION" : "QUEUED";
      // 507 (PROVEDOR_SEM_ESPACO) is a definite refusal from the provider, like a 4xx.
      else if (status >= 400 && status < 500 || status == 507) next = "REJECTED";
      else next = dispatched || "VERIFYING".equals(op.status()) ? "VERIFYING" : op.attempts() >= 4 ? "NEEDS_ATTENTION" : "QUEUED";
      long delay = ex instanceof ProviderApiException api && api.getRetryAfterSeconds() != null ? Math.max(1, api.getRetryAfterSeconds()) : Math.min(300, (1L << Math.min(8, op.attempts())) * 2) + ThreadLocalRandom.current().nextLong(3);
      try { store.defer(id, owner, next, delay, code, message); }
      catch (Exception persistence) { log.warn("Operation recovery will resume expired lease id={}", id); }
    } finally { lock.unlock(); }
  }

  private CloudItem replaceContent(ProviderConnectionEntity c, CloudProviderClient client, OperationDtos.Request r,
      CloudItem base, org.springframework.core.io.InputStreamSource upload, long size, String version) {
    String mime = base.mimeType() == null || base.mimeType().isBlank() ? "application/octet-stream" : base.mimeType();
    CloudItem written = retry.withRetry(c, token -> client.replaceContent(token, r.ref(), mime, size, upload, version));
    if (written.contentRevision() == null) written = retry.withRetry(c, token -> client.get(token, r.ref()));
    return written.withParent(base.parentRef(), base.parentKnown());
  }

  private void verify(OperationStore.Stored op, ProviderConnectionEntity c, CloudProviderClient client, String owner) {
    OperationDtos.Request r = op.request();
    if (r.kind() == OperationDtos.Kind.REPLACE_CONTENT) { verifyReplace(op, c, client, owner); return; }
    String ref = r.ref() != null ? r.ref() : op.prepared() == null ? null : op.prepared().remoteRef();
    if (ref != null) {
      try {
        CloudItem current = retry.withRetry(c, token -> client.get(token, ref));
        boolean confirmed = switch (r.kind()) {
          case CREATE_FOLDER -> current.kind() == ItemKind.FOLDER;
          case UPLOAD -> Objects.equals(current.size(), op.payload() == null ? null : op.payload().size());
          case UPDATE -> (r.name() == null || Objects.equals(current.name(), keepExtension(r.name(), op.base())))
              && (r.parentRef() == null || Objects.equals(current.parentRef(), r.parentRef().isBlank() ? null : r.parentRef()));
          case DELETE, REPLACE_CONTENT -> false; // REPLACE_CONTENT is handled by verifyReplace
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
        "RESULTADO_NAO_CONFIRMADO", "Não foi possível confirmar o resultado. Atualize antes de repetir a operação.");
  }
  /** An ambiguous content write landed only if the cloud now holds exactly the payload bytes. */
  private void verifyReplace(OperationStore.Stored op, ProviderConnectionEntity c, CloudProviderClient client, String owner) {
    OperationDtos.Request r = op.request();
    CloudItem current;
    try {
      current = retry.withRetry(c, token -> client.get(token, r.ref()));
    } catch (ProviderApiException ex) {
      if (ex.getStatus() != HttpStatus.NOT_FOUND) throw ex;
      store.defer(op.id(), owner, "REJECTED", 0, "ITEM_NAO_ENCONTRADO", "O arquivo não existe mais na nuvem.");
      return;
    }
    OperationStore.Payload payload = op.payload();
    if (payload != null && Objects.equals(current.size(), payload.size()) && payload.size() <= ReadPlanSupport.EDIT_MAX_BYTES
        && payload.hash().equals(currentHash(c, client, current))) {
      overlayAndSucceed(op, owner, c, current);
      return;
    }
    CloudItem base = op.base();
    if (base != null && Objects.equals(current.contentRevision(), base.contentRevision())) {
      store.defer(op.id(), owner, "QUEUED", 2, null, null); // the write did not land: safe to send again
      return;
    }
    store.defer(op.id(), owner, "REJECTED", 0, "ARQUIVO_ALTERADO", "O arquivo foi alterado na nuvem desde que foi aberto.");
  }

  private String currentHash(ProviderConnectionEntity c, CloudProviderClient client, CloudItem current) {
    try (ContentStream stream = retry.withRetry(c, token -> client.open(token, current, ContentVariant.ORIGINAL))) {
      java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
      byte[] bytes = new byte[64 * 1024];
      long remaining = ReadPlanSupport.EDIT_MAX_BYTES + 1;
      int read;
      while (remaining > 0 && (read = stream.body().read(bytes, 0, (int) Math.min(bytes.length, remaining))) != -1) {
        digest.update(bytes, 0, read);
        remaining -= read;
      }
      return HexFormat.of().formatHex(digest.digest());
    } catch (java.io.IOException | java.security.NoSuchAlgorithmException ex) {
      throw new ProviderApiException("Não foi possível conferir o conteúdo do arquivo.");
    }
  }

  private void overlayAndSucceed(OperationStore.Stored op, String owner, ProviderConnectionEntity c, CloudItem current) {
    CloudItem base = op.base();
    CloudItem result = base == null ? current : current.withParent(base.parentRef(), base.parentKnown());
    store.success(op, owner, c, result, null);
    readAuthorization.invalidate(c.getId(), op.request().ref());
  }
  static String keepExtension(String name, CloudItem current) {
    if (name == null || current == null || current.kind() != ItemKind.FILE || current.extension() == null || current.extension().isBlank()) return name;
    int dot = name.lastIndexOf('.');
    return dot > 0 && dot < name.length() - 1 ? name : name + "." + current.extension();
  }
  @PreDestroy public void close() { executor.shutdownNow(); }
}
