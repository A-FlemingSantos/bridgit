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

  public record ListItemsResponse(FolderContext folder, List<CloudItem> items, String nextCursor) {
  }

  public record ItemWithAncestry(@JsonUnwrapped CloudItem item, List<FolderRef> ancestry) {
  }

  public record CreateFolderRequest(String parentRef, String name) {
  }

  public record UpdateItemRequest(String name, String parentRef) {
  }

  public record DeleteItemResponse(boolean deleted) {
  }

  public record ReadResponse(ReadMode mode, String url, OffsetDateTime expiresAt) {

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

  public record SearchProviderStatus(String id, boolean ok, String error) {
  }

  public record SearchResponse(List<CloudItem> results, List<SearchProviderStatus> providers) {
  }
}
