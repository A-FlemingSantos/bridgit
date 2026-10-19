package com.bridgit.api.links;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/** The alias (slug) of a public link: lowercase words joined by single dashes. */
public final class LinkSlug {

  private static final Pattern NON_ALNUM = Pattern.compile("[^a-z0-9]+");
  private static final Pattern COLLAPSED_DASHES = Pattern.compile("-{2,}");
  private static final Pattern VALID = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");
  static final int MAX_LENGTH = 60;
  private static final String FILE_FALLBACK = "arquivo";
  private static final String FOLDER_FALLBACK = "pasta";

  private LinkSlug() {
  }

  public static String fromFileName(String fileName, String extension) {
    if (fileName == null || fileName.isBlank()) {
      return FILE_FALLBACK;
    }

    String baseName = fileName.trim();
    if (extension != null && !extension.isBlank()) {
      String suffix = "." + extension;
      if (baseName.toLowerCase(Locale.ROOT).endsWith(suffix.toLowerCase(Locale.ROOT))) {
        baseName = baseName.substring(0, baseName.length() - suffix.length());
      }
    }
    return slugify(baseName, FILE_FALLBACK);
  }

  public static String fromFolderName(String folderName) {
    if (folderName == null || folderName.isBlank()) {
      return FOLDER_FALLBACK;
    }
    return slugify(folderName.trim(), FOLDER_FALLBACK);
  }

  public static boolean isValidAlias(String alias) {
    return alias != null
        && !alias.isEmpty()
        && alias.length() <= MAX_LENGTH
        && VALID.matcher(alias).matches();
  }

  private static String slugify(String baseName, String fallback) {
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
      return fallback;
    }
    if (slug.length() > MAX_LENGTH) {
      slug = slug.substring(0, MAX_LENGTH).replaceAll("-+$", "");
    }
    return slug.isBlank() ? fallback : slug;
  }
}
