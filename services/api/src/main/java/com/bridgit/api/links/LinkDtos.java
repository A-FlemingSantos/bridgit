package com.bridgit.api.links;

import com.bridgit.api.providers.ReadMode;
import com.fasterxml.jackson.annotation.JsonInclude;

public final class LinkDtos {

  private LinkDtos() {
  }

  public record OwnerPublicLinkResponse(
      String url,
      String suffix
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
