package com.bridgit.api.operations;

import com.bridgit.api.catalog.LocalHubProperties;
import com.bridgit.api.common.api.UploadLimits;
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
    if (raw.kind() == OperationDtos.Kind.UPLOAD) throw new BadRequestException("UPLOAD_AUSENTE", "Envie o arquivo junto à operação.");
    if (raw.kind() == OperationDtos.Kind.REPLACE_CONTENT) throw new BadRequestException("CONTEUDO_AUSENTE", "Envie o conteúdo junto à operação.");
    UUID user = users.requireUserId();
    ProviderConnectionEntity connection = validateConnection(user, raw);
    OperationDtos.Request request = validate(raw, connection);
    return store.accept(user, connection, request, null).view();
  }
  public synchronized OperationDtos.View upload(OperationDtos.Request raw, long size, InputStreamSource source) {
    UUID user = users.requireUserId();
    ProviderConnectionEntity connection = validateConnection(user, raw);
    OperationDtos.Request request = validate(raw, connection);
    boolean replace = request.kind() == OperationDtos.Kind.REPLACE_CONTENT;
    if (request.kind() != OperationDtos.Kind.UPLOAD && !replace) throw new BadRequestException("OPERACAO_INVALIDA", "Operação de upload inválida.");
    if (replace && size > ReadPlanSupport.EDIT_MAX_BYTES) throw new BadRequestException("TEXTO_GRANDE_DEMAIS", "O texto excede o limite de 2 MB para edição.");
    if (size < 0 || size > UploadLimits.MAX_BYTES) throw new BadRequestException("ARQUIVO_GRANDE", "O arquivo excede o limite de " + UploadLimits.MAX_LABEL + ".");
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
  public CloudItem runLegacy(ConnectionScope scope, OperationDtos.Kind kind, String ref, String parent, String name,
      String contentType, long size, InputStreamSource content, String clientKey) {
    return runLegacy(scope, kind, ref, parent, name, contentType, size, content, clientKey, null);
  }
  public CloudItem runLegacy(ConnectionScope scope, OperationDtos.Kind kind, String ref, String parent, String name,
      String contentType, long size, InputStreamSource content, String clientKey, String expectedVersion) {
    if (clientKey == null || clientKey.isBlank() || clientKey.length() > 100) {
      throw new BadRequestException("IDEMPOTENCIA_OBRIGATORIA", "Envie Idempotency-Key (até 100 caracteres) e reutilize a mesma chave ao repetir esta ação.");
    }
    OperationDtos.Request request = new OperationDtos.Request(clientKey, scope.provider().id(), scope.connectionId(), null, kind, ref, parent, name, contentType, expectedVersion, null);
    OperationDtos.View accepted = kind == OperationDtos.Kind.UPLOAD || kind == OperationDtos.Kind.REPLACE_CONTENT ? upload(request, size, content) : submit(request);
    worker.execute(accepted.id());
    OperationDtos.View result = get(accepted.id());
    if ("SUCCEEDED".equals(result.status())) return result.item();
    if ("REJECTED".equals(result.status())) throw new ApiException(HttpStatus.CONFLICT, result.errorCode(), result.errorMessage());
    throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "OPERACAO_EM_VERIFICACAO", "A operação foi registrada e está sendo verificada. Reutilize a mesma Idempotency-Key ao repetir.");
  }
  private ProviderConnectionEntity validateConnection(UUID user, OperationDtos.Request request) {
    if (!enabled()) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "OPERACOES_INDISPONIVEIS", "Operações temporariamente indisponíveis.");
    if (request.kind() == null || request.connectionId() == null && request.provider() == null) throw new BadRequestException("OPERACAO_INVALIDA", "Informe a operação e o provedor.");
    ProviderConnectionEntity c;
    if (request.connectionId() != null) {
      c = connections.findOwned(user, request.connectionId()).orElseThrow(OperationService::connectionChanged);
      if (request.provider() != null && !request.provider().equals(c.getProvider())) throw connectionChanged();
      requireProviderEnabled(c.getProvider());
    } else {
      requireProviderEnabled(request.provider());
      c = connections.requireDefaultConnection(user, CloudProvider.fromId(request.provider()));
    }
    if (request.generation() != null && request.generation() != c.getGeneration()) throw connectionChanged();
    return c;
  }
  private void requireProviderEnabled(String providerId) {
    if (!properties.providerEnabled(providerId)) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "OPERACOES_INDISPONIVEIS", "Operações temporariamente indisponíveis.");
  }
  private static ConflictException connectionChanged() {
    return new ConflictException("CONEXAO_ALTERADA", "A conexão foi alterada. Atualize antes de tentar novamente.");
  }
  private OperationDtos.Request validate(OperationDtos.Request r, ProviderConnectionEntity c) {
    if (r.clientKey() == null || r.clientKey().isBlank() || r.clientKey().length() > 100) throw new BadRequestException("OPERACAO_INVALIDA", "Identificador de operação inválido.");
    if ((r.kind() == OperationDtos.Kind.UPDATE || r.kind() == OperationDtos.Kind.DELETE || r.kind() == OperationDtos.Kind.REPLACE_CONTENT) && (r.ref() == null || r.ref().isBlank())) throw new BadRequestException("ITEM_INVALIDO", "Informe o arquivo.");
    if (r.ref() != null && r.ref().length() > 400 || r.parentRef() != null && r.parentRef().length() > 400) throw new BadRequestException("ITEM_INVALIDO", "Identificador de arquivo inválido.");
    boolean replace = r.kind() == OperationDtos.Kind.REPLACE_CONTENT;
    if (replace && (r.expectedVersion() == null || r.expectedVersion().isBlank() || r.expectedVersion().length() > 400)) throw new BadRequestException("VERSAO_OBRIGATORIA", "Abra o arquivo novamente antes de salvar.");
    String name = replace ? null : r.name();
    if (r.kind() == OperationDtos.Kind.CREATE_FOLDER || r.kind() == OperationDtos.Kind.UPLOAD || name != null) name = ItemNameValidator.requireValidName(name);
    if (r.kind() == OperationDtos.Kind.UPDATE && name == null && r.parentRef() == null) throw new BadRequestException("OPERACAO_INVALIDA", "Informe a alteração desejada.");
    UUID dependencyId = replace ? null : r.dependencyId();
    if (dependencyId != null) {
      OperationStore.Stored dependency = store.require(c.getUserId(), dependencyId);
      if (!dependency.connectionId().equals(c.getId()) || dependency.generation() != c.getGeneration()) throw new ConflictException("DEPENDENCIA_INVALIDA", "Destino pertence a outra conexão.");
    }
    return new OperationDtos.Request(r.clientKey(), c.getProvider(), c.getId(), c.getGeneration(), r.kind(), r.ref(), replace ? null : r.parentRef(), name, r.contentType(), r.expectedVersion(), dependencyId);
  }
}
