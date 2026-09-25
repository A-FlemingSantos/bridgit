package com.bridgit.api.providers;

import com.bridgit.api.common.error.NotFoundException;
import com.fasterxml.jackson.annotation.JsonValue;

public enum CloudProvider {
  ONEDRIVE("onedrive", "OneDrive"),
  GOOGLE_DRIVE("google-drive", "Google Drive"),
  DROPBOX("dropbox", "Dropbox");

  private final String id;
  private final String displayName;

  CloudProvider(String id, String displayName) {
    this.id = id;
    this.displayName = displayName;
  }

  @JsonValue
  public String id() {
    return id;
  }

  public String displayName() {
    return displayName;
  }

  public static CloudProvider fromId(String value) {
    if (value == null) {
      throw new NotFoundException("PROVEDOR_DESCONHECIDO", "Provedor de nuvem desconhecido.");
    }
    for (CloudProvider provider : values()) {
      if (provider.id.equals(value)) {
        return provider;
      }
    }
    throw new NotFoundException("PROVEDOR_DESCONHECIDO", "Provedor de nuvem desconhecido.");
  }
}
