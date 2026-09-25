package com.bridgit.api.providers;

import com.fasterxml.jackson.annotation.JsonValue;

public enum ReadMode {
  PDF("pdf"),
  IMAGE("image"),
  TEXT("text"),
  VIDEO("video"),
  AUDIO("audio"),
  NONE("none");

  private final String value;

  ReadMode(String value) {
    this.value = value;
  }

  @JsonValue
  public String value() {
    return value;
  }
}
