package com.bridgit.api.providers;

import java.util.Comparator;
import java.util.List;

public final class CloudItemSupport {

  private static final Comparator<CloudItem> ITEM_ORDER = Comparator
      .comparing((CloudItem item) -> item.kind() != ItemKind.FOLDER)
      .thenComparing(item -> item.name() == null ? "" : item.name(), String.CASE_INSENSITIVE_ORDER);

  private CloudItemSupport() {
  }

  public static String extensionFromName(String name) {
    if (name == null || name.isBlank()) {
      return null;
    }
    int dot = name.lastIndexOf('.');
    if (dot < 0 || dot == name.length() - 1) {
      return null;
    }
    return name.substring(dot + 1).toLowerCase();
  }

  public static List<CloudItem> sortItems(List<CloudItem> items) {
    return items.stream().sorted(ITEM_ORDER).toList();
  }
}
