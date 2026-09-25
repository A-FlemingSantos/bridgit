package com.bridgit.api.links;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

public final class LinkSlug {

  private static final Pattern NON_ALNUM = Pattern.compile("[^a-z0-9]+");
  private static final Pattern COLLAPSED_DASHES = Pattern.compile("-{2,}");
  private static final int MAX_LENGTH = 60;
  private static final String FALLBACK = "arquivo";

  private LinkSlug() {
  }

  public static String fromFileName(String fileName, String extension) {
    if (fileName == null || fileName.isBlank()) {
      return FALLBACK;
    }

    String baseName = fileName.trim();
    if (extension != null && !extension.isBlank()) {
      String suffix = "." + extension;
      if (baseName.toLowerCase(Locale.ROOT).endsWith(suffix.toLowerCase(Locale.ROOT))) {
        baseName = baseName.substring(0, baseName.length() - suffix.length());
      }
    }

    String normalized = Normalizer.normalize(baseName, Normalizer.Form.NFKD);
    StringBuilder ascii = new StringBuilder(normalized.length());
    for (int i = 0; i < normalized.length(); i++) {
      char ch = normalized.charAt(i);
      if (ch < 128) {
        ascii.append(ch);
      }
    }

    String slug = NON_ALNUM.matcher(ascii.toString().toLowerCase(Locale.ROOT)).replaceAll("-");
    slug = COLLAPSED_DASHES.matcher(slug).replaceAll("-");
    slug = slug.replaceAll("^-+|-+$", "");

    if (slug.isBlank()) {
      return FALLBACK;
    }
    if (slug.length() > MAX_LENGTH) {
      slug = slug.substring(0, MAX_LENGTH).replaceAll("-+$", "");
    }
    return slug.isBlank() ? FALLBACK : slug;
  }
}
