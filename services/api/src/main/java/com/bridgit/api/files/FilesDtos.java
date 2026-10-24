package com.bridgit.api.files;

import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.ReadMode;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import java.time.OffsetDateTime;
import java.util.List;

public final class FilesDtos {

  private FilesDtos() {
  }

  public record FolderRef(String ref, String name) {
  }

  public record FolderContext(String ref, String name, List<FolderRef> ancestry) {
  }

  /**
   * freshness is "current" or "stale"; staleReason carries the error code behind a stale answer
   * (for instance RECONEXAO_NECESSARIA) and syncedAt says since when the data is known to be right.
   */
  public record CatalogMetadata(java.util.UUID connectionId, long generation, long revision,
      String coverage, OffsetDateTime syncedAt, String freshness, String staleReason) {}

  public record ListItemsResponse(FolderContext folder, List<CloudItem> items, String nextCursor,
      CatalogMetadata catalog) {
    public ListItemsResponse(FolderContext folder, List<CloudItem> items, String nextCursor) {
      this(folder, items, nextCursor, null);
    }
  }

  public record ItemWithAncestry(@JsonUnwrapped CloudItem item, List<FolderRef> ancestry,
      CatalogMetadata catalog) {
    public ItemWithAncestry(CloudItem item, List<FolderRef> ancestry) { this(item, ancestry, null); }
  }

  public record CreateFolderRequest(String parentRef, String name) {
  }

  public record UpdateItemRequest(String name, String parentRef) {
  }

  public record DeleteItemResponse(boolean deleted) {
  }

  public record ReadResponse(ReadMode mode, String url, OffsetDateTime expiresAt,
      java.util.UUID connectionId, Long generation, String ref, String revision, String variant,
      OffsetDateTime authorizedUntil, Long size, String proxyUrl, Boolean editable) {

    public ReadResponse(ReadMode mode, String url, OffsetDateTime expiresAt,
        java.util.UUID connectionId, Long generation, String ref, String revision, String variant,
        OffsetDateTime authorizedUntil, Long size, String proxyUrl) {
      this(mode, url, expiresAt, connectionId, generation, ref, revision, variant, authorizedUntil, size,
          proxyUrl, null);
    }

    public ReadResponse(ReadMode mode, String url, OffsetDateTime expiresAt) {
      this(mode, url, expiresAt, null, null, null, null, null, null, null, null, null);
    }

    public ReadResponse(ReadMode mode, String url) {
      this(mode, url, null);
    }
  }

  public record TicketRequest(String disposition) {
  }

  public record TicketResponse(String url, OffsetDateTime expiresAt) {

    public TicketResponse(String url) {
      this(url, null);
    }
  }

  // One entry per connection: `id` is the provider id, `connectionId` tells apart two accounts of it.
  public record SearchProviderStatus(String id, boolean ok, String error, java.util.UUID connectionId) {
  }

  // Serialized as the flat CloudItem plus connectionId.
  public record SearchResult(@JsonUnwrapped CloudItem item, java.util.UUID connectionId) {
  }

  public record SearchResponse(List<SearchResult> results, List<SearchProviderStatus> providers) {
  }
}
