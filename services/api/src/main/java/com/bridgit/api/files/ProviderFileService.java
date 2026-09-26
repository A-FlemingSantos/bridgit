package com.bridgit.api.files;

import com.bridgit.api.common.security.AuthenticatedUserService;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionService;
import com.bridgit.api.integrations.ProviderRetryService;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudItemChangedEvent;
import com.bridgit.api.providers.CloudItemDeletedEvent;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClient;
import com.bridgit.api.providers.CloudProviderClients;
import com.bridgit.api.providers.ContentRange;
import com.bridgit.api.providers.ContentStream;
import com.bridgit.api.providers.ContentVariant;
import com.bridgit.api.providers.ItemKind;
import com.bridgit.api.providers.ItemPage;
import com.bridgit.api.providers.ReadMode;
import com.bridgit.api.providers.ReadPlan;
import com.bridgit.api.providers.SealedCursorService;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.io.InputStreamSource;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class ProviderFileService {

  private final AuthenticatedUserService authenticatedUserService;
  private final ProviderConnectionService connectionService;
  private final ProviderRetryService retryService;
  private final CloudProviderClients clients;
  private final ContentTicketService contentTicketService;
  private final SealedCursorService sealedCursorService;
  private final ApplicationEventPublisher eventPublisher;

  public ProviderFileService(
      AuthenticatedUserService authenticatedUserService,
      ProviderConnectionService connectionService,
      ProviderRetryService retryService,
      CloudProviderClients clients,
      ContentTicketService contentTicketService,
      SealedCursorService sealedCursorService,
      ApplicationEventPublisher eventPublisher
  ) {
    this.authenticatedUserService = authenticatedUserService;
    this.connectionService = connectionService;
    this.retryService = retryService;
    this.clients = clients;
    this.contentTicketService = contentTicketService;
    this.sealedCursorService = sealedCursorService;
    this.eventPublisher = eventPublisher;
  }

  public FilesDtos.ListItemsResponse listItems(CloudProvider provider, String parentRef, String cursor) {
    UUID userId = authenticatedUserService.requireUserId();
    ProviderConnectionEntity connection = connectionService.requireConnection(userId, provider);
    CloudProviderClient client = clients.get(provider);
    String normalizedParent = normalizeParent(parentRef);

    String rawCursor = null;
    if (StringUtils.hasText(cursor)) {
      rawCursor = sealedCursorService.unseal(cursor, connection.getId(), normalizedParent);
    }
    String continuation = rawCursor;
    ItemPage page = retryService.withRetry(
        connection,
        token -> client.list(token, normalizedParent, continuation)
    );
    String sealedNext = sealedCursorService.seal(connection.getId(), normalizedParent, page.nextCursor());
    FilesDtos.FolderContext folder = buildFolderContext(provider, client, connection, parentRef);

    return new FilesDtos.ListItemsResponse(folder, page.items(), sealedNext);
  }

  public FilesDtos.ItemWithAncestry getItem(CloudProvider provider, String ref) {
    UUID userId = authenticatedUserService.requireUserId();
    ProviderConnectionEntity connection = connectionService.requireConnection(userId, provider);
    CloudProviderClient client = clients.get(provider);

    CloudItem item = retryService.withRetry(connection, token -> client.get(token, ref));
    List<FilesDtos.FolderRef> ancestry = mapAncestry(client, connection, ref);
    return new FilesDtos.ItemWithAncestry(item, ancestry);
  }

  public CloudItem createFolder(CloudProvider provider, String parentRef, String name) {
    String validName = ItemNameValidator.requireValidName(name);
    UUID userId = authenticatedUserService.requireUserId();
    ProviderConnectionEntity connection = connectionService.requireConnection(userId, provider);
    CloudProviderClient client = clients.get(provider);

    CloudItem item = retryService.withRetry(
        connection,
        token -> client.createFolder(token, normalizeParent(parentRef), validName)
    );
    eventPublisher.publishEvent(new CloudItemChangedEvent(connection.getId(), item));
    return item;
  }

  public CloudItem uploadFile(
      CloudProvider provider,
      String parentRef,
      String name,
      String contentType,
      long size,
      InputStreamSource content
  ) {
    String validName = ItemNameValidator.requireValidName(name);
    UUID userId = authenticatedUserService.requireUserId();
    ProviderConnectionEntity connection = connectionService.requireConnection(userId, provider);
    CloudProviderClient client = clients.get(provider);

    CloudItem item = retryService.withRetry(
        connection,
        token -> client.upload(token, normalizeParent(parentRef), validName, contentType, size, content)
    );
    eventPublisher.publishEvent(new CloudItemChangedEvent(connection.getId(), item));
    return item;
  }

  public CloudItem updateItem(CloudProvider provider, String ref, String newName, String newParentRef) {
    String validatedName = newName == null ? null : ItemNameValidator.requireValidName(newName);
    UUID userId = authenticatedUserService.requireUserId();
    ProviderConnectionEntity connection = connectionService.requireConnection(userId, provider);
    CloudProviderClient client = clients.get(provider);

    String finalName = validatedName == null
        ? null
        : keepExtension(validatedName, retryService.withRetry(connection, token -> client.get(token, ref)));
    CloudItem item = retryService.withRetry(
        connection,
        token -> client.update(token, ref, finalName, newParentRef)
    );
    eventPublisher.publishEvent(new CloudItemChangedEvent(connection.getId(), item));
    return item;
  }

  // A rename that drops the extension would leave the file unreadable by type; an explicit new extension is kept.
  static String keepExtension(String newName, CloudItem current) {
    if (current == null || current.kind() != ItemKind.FILE) return newName;
    String extension = current.extension();
    if (extension == null || extension.isBlank()) return newName;
    int dot = newName.lastIndexOf('.');
    boolean hasExtension = dot > 0 && dot < newName.length() - 1;
    return hasExtension ? newName : newName + "." + extension;
  }

  public FilesDtos.DeleteItemResponse deleteItem(CloudProvider provider, String ref) {
    UUID userId = authenticatedUserService.requireUserId();
    ProviderConnectionEntity connection = connectionService.requireConnection(userId, provider);
    CloudProviderClient client = clients.get(provider);

    retryService.withRetry(connection, token -> {
      client.delete(token, ref);
      return null;
    });
    eventPublisher.publishEvent(new CloudItemDeletedEvent(connection.getId(), ref));
    return new FilesDtos.DeleteItemResponse(true);
  }

  public FilesDtos.ReadResponse readItem(CloudProvider provider, String ref) {
    UUID userId = authenticatedUserService.requireUserId();
    ProviderConnectionEntity connection = connectionService.requireConnection(userId, provider);
    CloudProviderClient client = clients.get(provider);

    CloudItem item = retryService.withRetry(connection, token -> client.get(token, ref));
    ReadPlan plan = client.readPlan(item);
    if (plan.mode() == ReadMode.NONE) {
      return new FilesDtos.ReadResponse(ReadMode.NONE, null, null);
    }

    ContentTicketService.IssuedTicket issued = contentTicketService.createTicket(
        userId,
        connection.getId(),
        ref,
        plan.variant(),
        "inline"
    );
    return new FilesDtos.ReadResponse(plan.mode(), "/api/content/" + issued.ticket(), issued.expiresAt());
  }

  public FilesDtos.TicketResponse createDownloadTicket(
      CloudProvider provider,
      String ref,
      String disposition
  ) {
    String resolvedDisposition = "attachment".equalsIgnoreCase(disposition) ? "attachment" : "inline";
    UUID userId = authenticatedUserService.requireUserId();
    ProviderConnectionEntity connection = connectionService.requireConnection(userId, provider);

    ContentTicketService.IssuedTicket issued = contentTicketService.createTicket(
        userId,
        connection.getId(),
        ref,
        ContentVariant.ORIGINAL,
        resolvedDisposition
    );
    return new FilesDtos.TicketResponse("/api/content/" + issued.ticket(), issued.expiresAt());
  }

  public ContentStream openTicketContent(String ticket) {
    return openTicketContent(ticket, null);
  }

  public ContentStream openTicketContent(String ticket, String rangeHeader) {
    ContentTicketService.ContentTicket parsed = contentTicketService.parseTicket(ticket);
    ProviderConnectionEntity connection = connectionService.findById(parsed.connectionId())
        .orElseThrow(() -> new com.bridgit.api.common.error.NotFoundException(
            "CONTEUDO_NAO_ENCONTRADO",
            "Conteudo nao encontrado ou expirado."
        ));

    if (!parsed.userId().equals(connection.getUserId())) {
      throw new com.bridgit.api.common.error.NotFoundException(
          "CONTEUDO_NAO_ENCONTRADO",
          "Conteudo nao encontrado ou expirado."
      );
    }

    CloudProvider provider = CloudProvider.fromId(connection.getProvider());
    CloudProviderClient client = clients.get(provider);
    CloudItem item = retryService.withRetry(connection, token -> client.get(token, parsed.ref()));
    if (parsed.variant() == ContentVariant.ORIGINAL && StringUtils.hasText(rangeHeader)) {
      ContentRange range = ContentRange.parseSingle(rangeHeader, item.size());
      if (range != null) {
        ContentRange resolved = range;
        return retryService.withRetry(connection, token -> client.open(token, item, parsed.variant(), resolved));
      }
    }
    return retryService.withRetry(connection, token -> client.open(token, item, parsed.variant()));
  }

  private FilesDtos.FolderContext buildFolderContext(
      CloudProvider provider,
      CloudProviderClient client,
      ProviderConnectionEntity connection,
      String parentRef
  ) {
    if (!StringUtils.hasText(parentRef)) {
      return new FilesDtos.FolderContext(null, provider.displayName(), List.of());
    }

    CloudItem folder = retryService.withRetry(connection, token -> client.get(token, parentRef));
    List<FilesDtos.FolderRef> ancestry = mapAncestry(client, connection, parentRef);
    return new FilesDtos.FolderContext(parentRef, folder.name(), ancestry);
  }

  private List<FilesDtos.FolderRef> mapAncestry(
      CloudProviderClient client,
      ProviderConnectionEntity connection,
      String ref
  ) {
    List<CloudItem> ancestry = retryService.withRetry(connection, token -> client.ancestry(token, ref));
    return ancestry.stream()
        .map(item -> new FilesDtos.FolderRef(item.ref(), item.name()))
        .toList();
  }

  private static String normalizeParent(String parentRef) {
    if (parentRef == null || parentRef.isBlank()) {
      return null;
    }
    return parentRef;
  }
}
