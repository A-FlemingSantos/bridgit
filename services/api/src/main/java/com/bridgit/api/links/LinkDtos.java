package com.bridgit.api.links;

import com.bridgit.api.providers.ReadMode;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.OffsetDateTime;

public final class LinkDtos {

  private LinkDtos() {
  }

  public record OwnerPublicLinkResponse(
      String url,
      String suffix
  ) {
  }

  // One of the owner's links as listed in the hub. `kind` is always "file" today;
  // it is in the contract so published folders can be added without a new shape.
  public record OwnerPublicLinkSummary(
      String provider,
      String ref,
      String kind,
      String name,
      String mimeType,
      String extension,
      String url,
      OffsetDateTime createdAt,
      OffsetDateTime lastAccessedAt
  ) {
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record PublicLinkMetadata(
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
