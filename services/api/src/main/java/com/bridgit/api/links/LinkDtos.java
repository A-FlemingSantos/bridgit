package com.bridgit.api.links;

import com.bridgit.api.providers.ReadMode;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.OffsetDateTime;
import java.util.UUID;

public final class LinkDtos {

  private LinkDtos() {
  }

  // `suffix` repeats `code` for clients written before aliases existed.
  public record OwnerPublicLink(
      String url,
      String alias,
      String code,
      String kind,
      String suffix
  ) {
  }

  // One of the owner's links as listed in the hub.
  public record OwnerPublicLinkSummary(
      String provider,
      UUID connectionId,
      String ref,
      String kind,
      String name,
      String mimeType,
      String extension,
      String url,
      String alias,
      String code,
      OffsetDateTime createdAt,
      OffsetDateTime lastAccessedAt
  ) {
  }

  // A folder link only carries kind, name and providerName; everything else stays null (and is omitted).
  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record PublicLinkMetadata(
      String kind,
      String name,
      String mimeType,
      String extension,
      Long size,
      ReadMode mode,
      String providerName,
      String contentUrl,
      String readUrl
  ) {
  }
}
