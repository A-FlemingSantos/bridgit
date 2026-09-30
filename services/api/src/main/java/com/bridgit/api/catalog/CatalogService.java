package com.bridgit.api.catalog;

import com.bridgit.api.common.error.ConflictException;
import com.bridgit.api.files.FilesDtos;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderRetryService;
import com.bridgit.api.providers.*;
import com.bridgit.api.providers.sync.CloudSyncClient;
import java.util.*;
import org.springframework.stereotype.Service;

@Service
public class CatalogService {
  private static final int PAGE_SIZE = 200;
  private final CatalogStore store;
  private final LocalHubProperties properties;
  private final ProviderRetryService retry;
  private final SealedCursorService cursors;

  public CatalogService(CatalogStore store, LocalHubProperties properties, ProviderRetryService retry, SealedCursorService cursors) {
    this.store = store; this.properties = properties; this.retry = retry; this.cursors = cursors;
  }
  public boolean enabled(CloudProviderClient client) { return properties.isCatalogEnabled() && properties.providerEnabled(client.provider().id()) && client instanceof CloudSyncClient; }

  public FilesDtos.ListItemsResponse list(ProviderConnectionEntity c, CloudProviderClient client, String parent, String cursor) {
    store.touch(c);
    String raw = cursor == null ? null : cursors.unseal(cursor, c.getId(), parent);
    CatalogStore.FolderPage known = store.folder(c, parent, 0, PAGE_SIZE + 1);
    if (known.complete() && (raw == null || raw.startsWith("local:"))) {
      int offset = 0;
      if (raw != null) {
        String[] fields = raw.split(":");
        if (fields.length != 4 || !fields[1].equals(Long.toString(c.getGeneration())) || !fields[2].equals(Long.toString(known.state().revision()))) {
          throw new ConflictException("CATALOGO_ALTERADO", "A pasta foi atualizada. Recarregue a listagem.");
        }
        try { offset = Integer.parseInt(fields[3]); }
        catch (NumberFormatException ex) { throw new ConflictException("CURSOR_INVALIDO", "Paginacao invalida."); }
        if (offset < 0) throw new ConflictException("CURSOR_INVALIDO", "Paginacao invalida.");
      }
      CatalogStore.FolderPage window = offset == 0 ? known : store.folder(c, parent, offset, PAGE_SIZE + 1);
      if (window.state().revision() != known.state().revision()) throw new ConflictException("CATALOGO_ALTERADO", "A pasta foi atualizada. Recarregue a listagem.");
      int count = Math.min(PAGE_SIZE, window.items().size());
      String next = window.items().size() > PAGE_SIZE ? cursors.seal(c.getId(), parent, "local:" + c.getGeneration() + ":" + known.state().revision() + ":" + (offset + count)) : null;
      return new FilesDtos.ListItemsResponse(folderContext(c, client, parent), window.items().subList(0, count), next, store.metadata(c, known.state(), true));
    }
    String continuation = null;
    if (raw != null) {
      String prefix = "remote:" + c.getGeneration() + ":";
      if (!raw.startsWith(prefix)) throw new ConflictException("CATALOGO_ALTERADO", "A pasta foi atualizada. Recarregue a listagem.");
      continuation = raw.substring(prefix.length());
    }
    String nextRemote = continuation;
    ItemPage page = retry.withRetry(c, token -> client.list(token, parent, nextRemote));
    store.remember(c, page.items(), parent, page.nextCursor() == null);
    CatalogStore.State s = store.ensure(c);
    return new FilesDtos.ListItemsResponse(folderContext(c, client, parent), page.items(),
        page.nextCursor() == null ? null : cursors.seal(c.getId(), parent, "remote:" + c.getGeneration() + ":" + page.nextCursor()),
        store.metadata(c, s, page.nextCursor() == null));
  }

  public FilesDtos.ItemWithAncestry get(ProviderConnectionEntity c, CloudProviderClient client, String ref) {
    store.touch(c);
    CatalogStore.Entry cached = store.entry(c, ref);
    if (cached != null && !cached.deleted() && cached.item().parentKnown()) {
      List<FilesDtos.FolderRef> ancestry = store.ancestry(c, cached.item());
      if (cached.item().parentRef() == null || !ancestry.isEmpty()) {
        return new FilesDtos.ItemWithAncestry(cached.item(), ancestry, store.metadata(c, store.ensure(c), true));
      }
    }
    CloudItem item = retry.withRetry(c, token -> client.get(token, ref));
    List<CloudItem> parents = retry.withRetry(c, token -> client.ancestry(token, ref));
    for (CloudItem folder : parents) store.rememberItem(c, folder);
    store.rememberItem(c, item);
    return new FilesDtos.ItemWithAncestry(item, parents.stream().map(p -> new FilesDtos.FolderRef(p.ref(), p.name())).toList(), store.metadata(c, store.ensure(c), true));
  }

  private FilesDtos.FolderContext folderContext(ProviderConnectionEntity c, CloudProviderClient client, String parent) {
    if (parent == null) return new FilesDtos.FolderContext(null, client.provider().displayName(), List.of());
    FilesDtos.ItemWithAncestry folder = get(c, client, parent);
    return new FilesDtos.FolderContext(parent, folder.item().name(), folder.ancestry());
  }
}
