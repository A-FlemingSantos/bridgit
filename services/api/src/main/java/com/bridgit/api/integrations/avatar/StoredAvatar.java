package com.bridgit.api.integrations.avatar;

import java.time.OffsetDateTime;

/** A connection's cached profile photo, or the fact that it has none ({@code bytes} is null then). */
public record StoredAvatar(
    long generation,
    boolean hasPhoto,
    String contentType,
    byte[] bytes,
    String etag,
    OffsetDateTime fetchedAt
) {

  public static StoredAvatar photo(
      long generation,
      String contentType,
      byte[] bytes,
      String etag,
      OffsetDateTime fetchedAt
  ) {
    return new StoredAvatar(generation, true, contentType, bytes, etag, fetchedAt);
  }

  public static StoredAvatar none(long generation, OffsetDateTime fetchedAt) {
    return new StoredAvatar(generation, false, null, null, null, fetchedAt);
  }
}
