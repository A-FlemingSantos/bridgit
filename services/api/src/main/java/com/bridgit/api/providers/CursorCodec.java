package com.bridgit.api.providers;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

public final class CursorCodec {

  private CursorCodec() {
  }

  public static String encode(String raw) {
    if (raw == null || raw.isBlank()) {
      return null;
    }
    return Base64.getUrlEncoder().withoutPadding()
        .encodeToString(raw.getBytes(StandardCharsets.UTF_8));
  }

  public static String decode(String cursor) {
    if (cursor == null || cursor.isBlank()) {
      return null;
    }
    return new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
  }
}
