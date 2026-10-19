package com.bridgit.api.links;

import com.bridgit.api.catalog.CatalogService;
import com.bridgit.api.catalog.CatalogStore;
import com.bridgit.api.common.error.ApiException;
import com.bridgit.api.common.error.NotFoundException;
import com.bridgit.api.files.FilesDtos;
import com.bridgit.api.integrations.ProviderRetryService;
import com.bridgit.api.links.PublicFolderDtos.PublicCrumb;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.ProviderApiException;
import java.util.List;
import java.util.Objects;
import org.springframework.stereotype.Component;

/**
 * Decides whether an item lies inside the folder a public link shares. The answer never leaks: an item that
 * does not exist and one that sits elsewhere in the owner's drive are refused with the same error.
 */
@Component
class PublicLinkScope {

  static final String ITEM_NOT_FOUND_CODE = "LINK_ITEM_NAO_ENCONTRADO";
  static final String ITEM_NOT_FOUND_MESSAGE = "Este item não está disponível neste link.";

  private final ProviderRetryService retryService;
  private final CatalogService catalog;
  private final CatalogStore catalogStore;

  PublicLinkScope(ProviderRetryService retryService, CatalogService catalog, CatalogStore catalogStore) {
    this.retryService = retryService;
    this.catalog = catalog;
    this.catalogStore = catalogStore;
  }

  static NotFoundException itemNotFound() {
    return new NotFoundException(ITEM_NOT_FOUND_CODE, ITEM_NOT_FOUND_MESSAGE);
  }

  static boolean isItemNotFound(RuntimeException ex) {
    return ex instanceof NotFoundException notFound && ITEM_NOT_FOUND_CODE.equals(notFound.getCode());
  }

  /**
   * Failure of a provider step for a child of the shared folder: a hiccup that may pass says to try again
   * (503); anything else the visitor cannot act on is the same 404 as a missing item.
   */
  static RuntimeException childFailure(RuntimeException ex) {
    if (ex instanceof ProviderApiException providerEx && PublicLinkErrors.isTransient(providerEx)) {
      return PublicLinkErrors.publicFailure(ex);
    }
    if (ex instanceof LinkUnavailableException || isItemNotFound(ex)) {
      return ex;
    }
    if (ex instanceof ApiException) {
      return itemNotFound();
    }
    return ex;
  }

  /**
   * Folders between the shared folder and {@code item}, both excluded, nearest to the root first.
   * Throws the item-not-found error when {@code item} is not inside the shared folder.
   */
  List<PublicCrumb> requireInside(ResolvedPublicLink ctx, CloudItem item) {
    String rootRef = ctx.root().ref();
    if (Objects.equals(item.ref(), rootRef)) {
      return List.of();
    }
    if (item.parentKnown() && Objects.equals(rootRef, item.parentRef())) {
      return List.of();
    }

    if (item.parentKnown() && catalog.enabled(ctx.client())) {
      List<FilesDtos.FolderRef> chain = catalogStore.ancestry(ctx.connection(), item);
      List<PublicCrumb> crumbs = chain.stream().map(f -> new PublicCrumb(f.ref(), f.name())).toList();
      List<PublicCrumb> inside = afterRoot(crumbs, rootRef);
      if (inside != null) {
        return inside;
      }
      // The catalog may only know the nearest ancestors; absence is not proof of being outside.
    }

    List<CloudItem> chain;
    try {
      chain = retryService.withRetry(ctx.connection(), token -> ctx.client().ancestry(token, item.ref()));
    } catch (RuntimeException ex) {
      throw childFailure(ex);
    }
    List<PublicCrumb> crumbs = chain.stream().map(f -> new PublicCrumb(f.ref(), f.name())).toList();
    List<PublicCrumb> inside = afterRoot(crumbs, rootRef);
    if (inside == null) {
      throw itemNotFound();
    }
    return inside;
  }

  // The crumbs below the root, or null when the root is not among them.
  private static List<PublicCrumb> afterRoot(List<PublicCrumb> crumbs, String rootRef) {
    for (int index = 0; index < crumbs.size(); index++) {
      if (Objects.equals(crumbs.get(index).ref(), rootRef)) {
        return List.copyOf(crumbs.subList(index + 1, crumbs.size()));
      }
    }
    return null;
  }
}
