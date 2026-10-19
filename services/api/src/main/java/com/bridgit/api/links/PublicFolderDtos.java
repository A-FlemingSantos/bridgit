package com.bridgit.api.links;

import com.bridgit.api.providers.ItemKind;
import java.time.OffsetDateTime;
import java.util.List;

/** What an anonymous visitor sees of a shared folder: names and kinds, never provider internals. */
public final class PublicFolderDtos {

  private PublicFolderDtos() {
  }

  /** A folder on the way down. {@code ref} is null for the shared folder itself. */
  public record PublicCrumb(String ref, String name) {
  }

  public record PublicItem(
      String ref,
      String name,
      ItemKind kind,
      String mimeType,
      String extension,
      Long size,
      OffsetDateTime modifiedAt
  ) {
  }

  /**
   * One page of a folder. {@code path} holds the ancestors from the shared folder (ref null) down to, but
   * excluding, {@code folder}; it is empty at the shared folder itself.
   */
  public record PublicFolderListing(
      PublicCrumb folder,
      List<PublicCrumb> path,
      List<PublicItem> items,
      String nextCursor
  ) {
  }
}
