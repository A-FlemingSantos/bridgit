package com.bridgit.api.providers;

import java.time.OffsetDateTime;

public record CloudItem(
    String ref,
    String provider,
    String name,
    ItemKind kind,
    String mimeType,
    String extension,
    Long size,
    OffsetDateTime modifiedAt,
    String parentRef,
    boolean parentKnown,
    String remoteVersion,
    String contentRevision
) {

  public CloudItem(String ref, String provider, String name, ItemKind kind, String mimeType,
      String extension, Long size, OffsetDateTime modifiedAt, String parentRef, boolean parentKnown) {
    this(ref, provider, name, kind, mimeType, extension, size, modifiedAt, parentRef, parentKnown, null, null);
  }

  public CloudItem withVersions(String remoteVersion, String contentRevision) {
    return new CloudItem(ref, provider, name, kind, mimeType, extension, size, modifiedAt,
        parentRef, parentKnown, remoteVersion, contentRevision);
  }

  public CloudItem(
      String ref,
      String provider,
      String name,
      ItemKind kind,
      String mimeType,
      String extension,
      Long size,
      OffsetDateTime modifiedAt,
      String parentRef
  ) {
    this(ref, provider, name, kind, mimeType, extension, size, modifiedAt, parentRef, true);
  }
}
