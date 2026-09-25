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
    String parentRef
) {
}
