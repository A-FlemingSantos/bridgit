package com.bridgit.api.auth;

import java.util.Locale;

public enum ClientKind {
  WEB,
  MOBILE;

  public static ClientKind parse(String value) {
    if (value == null) {
      return null;
    }
    try {
      return valueOf(value.trim().toUpperCase(Locale.ROOT));
    } catch (IllegalArgumentException ex) {
      return null;
    }
  }
}
