package com.bridgit.api.providers.sync;

import com.bridgit.api.providers.CloudItem;
import java.util.Set;

/** A provider change. Null fields are only authoritative when named in knownFields. */
public record CloudChange(String ref, CloudItem item, boolean deleted, String path,
    String parentPath, Set<String> knownFields) {
  public CloudChange {
    knownFields = knownFields == null ? Set.of() : Set.copyOf(knownFields);
  }

  public static CloudChange upsert(CloudItem item) {
    return new CloudChange(item.ref(), item, false, null, null,
        Set.of("name", "kind", "mimeType", "extension", "size", "modifiedAt",
            "parentRef", "remoteVersion", "contentRevision"));
  }

  public static CloudChange removed(String ref) {
    return new CloudChange(ref, null, true, null, null, Set.of());
  }
}
