package com.bridgit.api.providers;

import com.fasterxml.jackson.annotation.JsonValue;

public enum ItemKind {
  FOLDER("folder"),
  FILE("file");

  private final String value;

  ItemKind(String value) {
    this.value = value;
  }

  @JsonValue
  public String value() {
    return value;
  }
}
