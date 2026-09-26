package com.bridgit.api.providers;

import java.util.List;
import org.springframework.core.io.InputStreamSource;

public interface CloudProviderClient {

  CloudProvider provider();

  /**
   * Lists the direct children of a folder. The canonical root is {@code parentRef == null};
   * for non-root parents {@code parentRef} is the parent's ref as used by listings (same
   * identity). Items at the root carry {@code parentRef == null} with {@code parentKnown}
   * true; when the adapter cannot determine the parent cheaply it returns
   * {@code parentRef == null} with {@code parentKnown} false (unknown, not root).
   *
   * @param cursor the raw provider continuation from a previous {@link ItemPage}, or null
   */
  ItemPage list(String accessToken, String parentRef, String cursor);

  CloudItem get(String accessToken, String ref);

  /**
   * Returns the ancestor folders of the item, ordered from the root child down to the
   * immediate parent. The item itself and the root are never included, so an item directly
   * under the root yields an empty list, as does an item whose parents are not visible.
   */
  List<CloudItem> ancestry(String accessToken, String ref);

  CloudItem createFolder(String accessToken, String parentRef, String name);

  /**
   * Uploads content, opening a fresh stream from {@code content} per attempt so the call
   * can be retried after a 401 refresh. Implementations must not retain the stream.
   */
  CloudItem upload(
      String accessToken,
      String parentRef,
      String name,
      String contentType,
      long size,
      InputStreamSource content
  );

  CloudItem update(String accessToken, String ref, String newName, String newParentRef);

  void delete(String accessToken, String ref);

  ReadPlan readPlan(CloudItem item);

  ContentStream open(String accessToken, CloudItem item, ContentVariant variant);

  /**
   * Opens content honoring a single byte range for ORIGINAL content. The default
   * implementation ignores the range; adapters forward it to the provider for
   * {@link ContentVariant#ORIGINAL} and never for READ/export/conversion variants.
   */
  default ContentStream open(
      String accessToken,
      CloudItem item,
      ContentVariant variant,
      ContentRange range
  ) {
    return open(accessToken, item, variant);
  }

  List<CloudItem> search(String accessToken, String query, int limit);
}
