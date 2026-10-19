package com.bridgit.api.links;

import static com.bridgit.api.links.PublicLinkErrors.linkNotFound;
import static com.bridgit.api.links.PublicLinkScope.childFailure;
import static com.bridgit.api.links.PublicLinkScope.isItemNotFound;
import static com.bridgit.api.links.PublicLinkScope.itemNotFound;

import com.bridgit.api.catalog.CatalogService;
import com.bridgit.api.common.error.ApiException;
import com.bridgit.api.common.error.ConflictException;
import com.bridgit.api.files.FilesDtos;
import com.bridgit.api.integrations.ProviderRetryService;
import com.bridgit.api.links.LinkDtos.PublicLinkMetadata;
import com.bridgit.api.links.PublicFolderDtos.PublicCrumb;
import com.bridgit.api.links.PublicFolderDtos.PublicFolderListing;
import com.bridgit.api.links.PublicFolderDtos.PublicItem;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.ItemKind;
import com.bridgit.api.providers.ItemPage;
import com.bridgit.api.providers.SealedCursorService;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.function.Supplier;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.util.UriUtils;

/**
 * Anonymous browsing inside a shared folder. Every request resolves the link first (limits, self-cleaning
 * when the shared folder is gone), then proves that the requested item is inside that folder before
 * listing or streaming anything. A missing child never deletes the link.
 */
@Service
class PublicFolderLinkService {

  private static final String FOLDER_CHANGED_CODE = "PASTA_ALTERADA";
  private static final String FOLDER_CHANGED_MESSAGE = "A pasta foi atualizada. Recarregue a listagem.";
  // Cursors are bound to a folder key; the shared folder gets a key no provider ref can collide with.
  private static final String ROOT_KEY = "root:";
  private static final String FOLDER_KEY_PREFIX = "folder:";

  private final PublicLinkService links;
  private final PublicLinkScope scope;
  private final ProviderRetryService retryService;
  private final SealedCursorService cursors;
  private final CatalogService catalog;

  PublicFolderLinkService(
      PublicLinkService links,
      PublicLinkScope scope,
      ProviderRetryService retryService,
      SealedCursorService cursors,
      CatalogService catalog
  ) {
    this.links = links;
    this.scope = scope;
    this.retryService = retryService;
    this.cursors = cursors;
    this.catalog = catalog;
  }

  PublicFolderListing list(String linkRef, String folderRef, String cursor, String clientIp) {
    ResolvedPublicLink ctx = resolveFolderLink(linkRef, clientIp);
    CloudItem root = ctx.root();

    CloudItem current = root;
    List<PublicCrumb> path = List.of();
    if (StringUtils.hasText(folderRef) && !folderRef.equals(root.ref())) {
      Child child = fetchChild(ctx, folderRef, clientIp);
      if (child.item().kind() != ItemKind.FOLDER) {
        throw missed(clientIp);
      }
      if (!Objects.equals(child.item().ref(), root.ref())) {
        current = child.item();
        List<PublicCrumb> trail = new ArrayList<>();
        trail.add(new PublicCrumb(null, root.name()));
        trail.addAll(child.crumbs());
        path = List.copyOf(trail);
      }
    }
    boolean atRoot = current == root;
    String folderKey = atRoot ? ROOT_KEY : FOLDER_KEY_PREFIX + current.ref();

    String inner = unsealCursor(ctx, folderKey, cursor);
    ItemPage page = listChildren(ctx, current.ref(), inner, clientIp);

    List<PublicItem> items = page.items().stream().map(PublicFolderLinkService::toPublicItem).toList();
    String next = cursors.seal(ctx.link().getId(), folderKey, page.nextCursor());
    PublicCrumb folder = new PublicCrumb(atRoot ? null : current.ref(), current.name());

    links.touchLastAccess(ctx.link().getId());
    return new PublicFolderListing(folder, path, items, next);
  }

  PublicLinkMetadata itemMetadata(String linkRef, String itemRef, String clientIp) {
    ResolvedPublicLink ctx = resolveFolderLink(linkRef, clientIp);
    CloudItem item = fetchChild(ctx, itemRef, clientIp).item();

    PublicLinkMetadata metadata;
    if (item.kind() == ItemKind.FOLDER) {
      metadata = new PublicLinkMetadata(
          PublicLinkEntity.KIND_FOLDER, item.name(), null, null, null, null, ctx.provider().displayName(), null, null);
    } else {
      try {
        metadata = links.fileMetadata(ctx, item, itemPath(ctx, item));
      } catch (ApiException ex) {
        throw asChildMiss(ex);
      }
    }
    links.touchLastAccess(ctx.link().getId());
    return metadata;
  }

  void streamItemContent(
      String linkRef,
      String itemRef,
      String variant,
      String rangeHeader,
      String clientIp,
      HttpServletResponse response
  ) throws IOException {
    ResolvedPublicLink ctx = resolveFolderLink(linkRef, clientIp);
    CloudItem item = fetchChild(ctx, itemRef, clientIp).item();
    if (item.kind() == ItemKind.FOLDER) {
      throw missed(clientIp);
    }
    try {
      links.streamItem(ctx, item, variant, rangeHeader, response);
    } catch (ApiException ex) {
      throw asChildMiss(ex);
    }
    links.touchLastAccess(ctx.link().getId());
  }

  // A file link has no children to browse.
  private ResolvedPublicLink resolveFolderLink(String linkRef, String clientIp) {
    ResolvedPublicLink ctx = links.resolve(linkRef, clientIp);
    if (!ctx.link().isFolder()) {
      throw linkNotFound();
    }
    return ctx;
  }

  private record Child(CloudItem item, List<PublicCrumb> crumbs) {
  }

  // Always fresh from the provider, and always checked against the shared folder before anything else.
  private Child fetchChild(ResolvedPublicLink ctx, String itemRef, String clientIp) {
    if (!StringUtils.hasText(itemRef)) {
      throw missed(clientIp);
    }
    return recordingMisses(clientIp, () -> {
      CloudItem item;
      try {
        item = retryService.withRetry(ctx.connection(), token -> ctx.client().get(token, itemRef));
      } catch (RuntimeException ex) {
        throw childFailure(ex);
      }
      return new Child(item, scope.requireInside(ctx, item));
    });
  }

  private ItemPage listChildren(ResolvedPublicLink ctx, String parentRef, String innerCursor, String clientIp) {
    return recordingMisses(clientIp, () -> {
      try {
        if (catalog.enabled(ctx.client())) {
          FilesDtos.ListItemsResponse response =
              catalog.list(ctx.connection(), ctx.client(), parentRef, innerCursor);
          return new ItemPage(response.items(), response.nextCursor());
        }
        return retryService.withRetry(
            ctx.connection(), token -> ctx.client().list(token, parentRef, innerCursor));
      } catch (ApiException ex) {
        if (isStaleCursor(ex)) {
          throw folderChanged();
        }
        throw childFailure(ex);
      } catch (RuntimeException ex) {
        throw childFailure(ex);
      }
    });
  }

  // A cursor that does not belong to this link and folder, or whose folder moved on, asks for a reload.
  private String unsealCursor(ResolvedPublicLink ctx, String folderKey, String cursor) {
    if (!StringUtils.hasText(cursor)) {
      return null;
    }
    try {
      return cursors.unseal(cursor, ctx.link().getId(), folderKey);
    } catch (RuntimeException ex) {
      throw folderChanged();
    }
  }

  private static boolean isStaleCursor(ApiException ex) {
    return "CURSOR_INVALIDO".equals(ex.getCode()) || "CATALOGO_ALTERADO".equals(ex.getCode());
  }

  private static ConflictException folderChanged() {
    return new ConflictException(FOLDER_CHANGED_CODE, FOLDER_CHANGED_MESSAGE);
  }

  // A1's file steps answer "the link is gone"; for a child that must read as "this item is gone".
  private static ApiException asChildMiss(ApiException ex) {
    return PublicLinkErrors.LINK_NOT_FOUND_CODE.equals(ex.getCode()) ? itemNotFound() : ex;
  }

  private <T> T recordingMisses(String clientIp, Supplier<T> step) {
    try {
      return step.get();
    } catch (RuntimeException ex) {
      if (isItemNotFound(ex)) {
        links.recordFailedLookup(clientIp);
      }
      throw ex;
    }
  }

  private RuntimeException missed(String clientIp) {
    links.recordFailedLookup(clientIp);
    return itemNotFound();
  }

  private String itemPath(ResolvedPublicLink ctx, CloudItem item) {
    return "/api/public/links/" + links.canonicalRef(ctx.link()) + "/items/"
        + UriUtils.encodePathSegment(item.ref(), StandardCharsets.UTF_8);
  }

  private static PublicItem toPublicItem(CloudItem item) {
    return new PublicItem(
        item.ref(), item.name(), item.kind(), item.mimeType(), item.extension(), item.size(), item.modifiedAt());
  }
}
