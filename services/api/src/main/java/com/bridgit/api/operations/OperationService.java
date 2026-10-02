package com.bridgit.api.operations;

import com.bridgit.api.catalog.LocalHubProperties;
import com.bridgit.api.common.error.*;
import com.bridgit.api.common.security.AuthenticatedUserService;
import com.bridgit.api.files.ItemNameValidator;
import com.bridgit.api.integrations.*;
import com.bridgit.api.providers.*;
import java.util.*;
import org.springframework.core.io.InputStreamSource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class OperationService {
  private final OperationStore store;
  private final UploadPayloadStore payloads;
  private final ProviderConnectionService connections;
  private final AuthenticatedUserService users;
  private final LocalHubProperties properties;
  private final OperationWorker worker;
  public OperationService(OperationStore store, UploadPayloadStore payloads, ProviderConnectionService connections,
      AuthenticatedUserService users, LocalHubProperties properties, OperationWorker worker) {
    this.store = store; this.payloads = payloads; this.connections = connections; this.users = users; this.properties = properties; this.worker = worker;
  }
  public boolean enabled() { return properties.isOperationsEnabled(); }
  public boolean enabled(CloudProvider provider) { return enabled() && properties.providerEnabled(provider.id()); }
  public OperationDtos.View submit(OperationDtos.Request raw) {
    if (raw.kind() == OperationDtos.Kind.UPLOAD) throw new BadRequestException("UPLOAD_AUSENTE", "Envie o arquivo junto a operacao.");
    UUID user = users.requireUserId();
    ProviderConnectionEntity connection = validateConnection(user, raw);
    OperationDtos.Request request = validate(raw, connection);
    return store.accept(user, connection, request, null).view();
  }
  public synchronized OperationDtos.View upload(OperationDtos.Request raw, long size, InputStreamSource source) {
    UUID user = users.requireUserId();
    ProviderConnectionEntity connection = validateConnection(user, raw);
    OperationDtos.Request request = validate(raw, connection);
    if (request.kind() != OperationDtos.Kind.UPLOAD) throw new BadRequestException("OPERACAO_INVALIDA", "Operacao de upload invalida.");
    if (size < 0 || size > 50L * 1024 * 1024) throw new BadRequestException("ARQUIVO_GRANDE", "O arquivo excede o limite de 50 MB.");
    if (store.pendingBytes(null) + size > properties.getUploadGlobalBytes() || store.pendingBytes(user) + size > properties.getUploadUserBytes()) {
      throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "UPLOAD_FILA_CHEIA", "Aguarde os envios pendentes antes de enviar mais arquivos.");
    }
    OperationStore.Payload payload = payloads.receive(source, size);
    try {
      OperationStore.Stored accepted = store.accept(user, connection, request, payload);
      if (accepted.payload() == null || !accepted.payload().path().equals(payload.path())) payloads.remove(payload);
      return accepted.view();
    } catch (RuntimeException ex) { payloads.remove(payload); throw ex; }
  }
  public OperationDtos.View get(UUID id) { return store.require(users.requireUserId(), id).view(); }
  public List<OperationDtos.View> pending() { return store.pending(users.requireUserId()); }
  public OperationDtos.View retry(UUID id) { store.retry(users.requireUserId(), id); return get(id); }

  /** Legacy routes retain their response shape, but use exactly the same journal and executor. */
  public CloudItem runLegacy(CloudProvider provider, OperationDtos.Kind kind, String ref, String parent, String name,
      String contentType, long size, InputStreamSource content, String clientKey) {
    if (clientKey == null || clientKey.isBlank() || clientKey.length() > 100) {
      throw new BadRequestException("IDEMPOTENCIA_OBRIGATORIA", "Envie Idempotency-Key (ate 100 caracteres) e reutilize a mesma chave ao repetir esta acao.");
    }
    OperationDtos.Request request = new OperationDtos.Request(clientKey, provider.id(), null, null, kind, ref, parent, name, contentType, null, null);
    OperationDtos.View accepted = kind == OperationDtos.Kind.UPLOAD ? upload(request, size, content) : submit(request);
    worker.execute(accepted.id());
    OperationDtos.View result = get(accepted.id());
    if ("SUCCEEDED".equals(result.status())) return result.item();
    if ("REJECTED".equals(result.status())) throw new ApiException(HttpStatus.CONFLICT, result.errorCode(), result.errorMessage());
    throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "OPERACAO_EM_VERIFICACAO", "A operacao foi registrada e esta sendo verificada. Reutilize a mesma Idempotency-Key ao repetir.");
  }
  private ProviderConnectionEntity validateConnection(UUID user, OperationDtos.Request request) {
    if (!enabled()) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "OPERACOES_INDISPONIVEIS", "Operacoes temporariamente indisponiveis.");
    if (request.provider() == null || request.kind() == null) throw new BadRequestException("OPERACAO_INVALIDA", "Informe a operacao e o provedor.");
    if (!properties.providerEnabled(request.provider())) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "OPERACOES_INDISPONIVEIS", "Operacoes temporariamente indisponiveis.");
    ProviderConnectionEntity c = connections.requireConnection(user, CloudProvider.fromId(request.provider()));
    if (request.connectionId() != null && !request.connectionId().equals(c.getId()) || request.generation() != null && request.generation() != c.getGeneration()) {
      throw new ConflictException("CONEXAO_ALTERADA", "A conexao foi alterada. Atualize antes de tentar novamente.");
    }
    return c;
  }
  private OperationDtos.Request validate(OperationDtos.Request r, ProviderConnectionEntity c) {
    if (r.clientKey() == null || r.clientKey().isBlank() || r.clientKey().length() > 100) throw new BadRequestException("OPERACAO_INVALIDA", "Identificador de operacao invalido.");
    if ((r.kind() == OperationDtos.Kind.UPDATE || r.kind() == OperationDtos.Kind.DELETE) && (r.ref() == null || r.ref().isBlank())) throw new BadRequestException("ITEM_INVALIDO", "Informe o arquivo.");
    if (r.ref() != null && r.ref().length() > 400 || r.parentRef() != null && r.parentRef().length() > 400) throw new BadRequestException("ITEM_INVALIDO", "Identificador de arquivo invalido.");
    String name = r.name();
    if (r.kind() == OperationDtos.Kind.CREATE_FOLDER || r.kind() == OperationDtos.Kind.UPLOAD || name != null) name = ItemNameValidator.requireValidName(name);
    if (r.kind() == OperationDtos.Kind.UPDATE && name == null && r.parentRef() == null) throw new BadRequestException("OPERACAO_INVALIDA", "Informe a alteracao desejada.");
    if (r.dependencyId() != null) {
      OperationStore.Stored dependency = store.require(c.getUserId(), r.dependencyId());
      if (!dependency.connectionId().equals(c.getId()) || dependency.generation() != c.getGeneration()) throw new ConflictException("DEPENDENCIA_INVALIDA", "Destino pertence a outra conexao.");
    }
    return new OperationDtos.Request(r.clientKey(), c.getProvider(), c.getId(), c.getGeneration(), r.kind(), r.ref(), r.parentRef(), name, r.contentType(), r.expectedVersion(), r.dependencyId());
  }
}
