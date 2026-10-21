package com.bridgit.api.providers;

import java.util.Locale;
import java.util.Set;

/**
 * Which catalog items can have a cloud thumbnail. Dropbox only thumbnails images, and only under 20 MB.
 * OneDrive and Google Drive also thumbnail PDF and Office, including native Docs, Sheets and Slides,
 * and plain text: .txt and .md on OneDrive, .txt on Drive.
 */
public final class ThumbnailSupport {

  static final long DROPBOX_MAX_BYTES = 20L * 1024L * 1024L;

  private static final Set<String> IMAGE_EXTENSIONS = Set.of(
      "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "heic", "tif", "tiff"
  );

  private static final Set<String> DROPBOX_IMAGE_EXTENSIONS = Set.of(
      "jpg", "jpeg", "png", "tiff", "tif", "gif", "webp", "ppm", "bmp"
  );

  private static final Set<String> WORD_EXTENSIONS = Set.of("doc", "docx", "docm");
  private static final Set<String> EXCEL_EXTENSIONS = Set.of("xls", "xlsx", "xlsm", "xlsb");
  private static final Set<String> POWERPOINT_EXTENSIONS = Set.of("ppt", "pptx", "pptm", "pps", "ppsx");

  // Measured against the clouds: OneDrive draws .txt and .md pages, Drive only .txt, Dropbox neither.
  private static final Set<String> ONEDRIVE_TEXT_EXTENSIONS = Set.of("txt", "md");
  private static final Set<String> DRIVE_TEXT_EXTENSIONS = Set.of("txt");

  private static final String GOOGLE_DOCUMENT = "application/vnd.google-apps.document";
  private static final String GOOGLE_SPREADSHEET = "application/vnd.google-apps.spreadsheet";
  private static final String GOOGLE_PRESENTATION = "application/vnd.google-apps.presentation";

  private ThumbnailSupport() {
  }

  public static boolean eligible(CloudProvider provider, CloudItem item) {
    if (item == null || item.kind() == ItemKind.FOLDER) {
      return false;
    }
    if (provider == CloudProvider.DROPBOX) {
      return dropboxImage(item);
    }
    return image(item) || pdf(item) || office(item) || googleNative(provider, item) || text(provider, item);
  }

  /** Keeps an image media type from the provider; anything else becomes JPEG. */
  public static String imageContentType(String headerValue) {
    if (headerValue == null) {
      return "image/jpeg";
    }
    String type = headerValue.toLowerCase(Locale.ROOT).trim();
    int semi = type.indexOf(';');
    if (semi >= 0) {
      type = type.substring(0, semi).trim();
    }
    if (type.startsWith("image/") && type.length() > "image/".length()) {
      return type;
    }
    return "image/jpeg";
  }

  private static boolean dropboxImage(CloudItem item) {
    if (!DROPBOX_IMAGE_EXTENSIONS.contains(extension(item))) {
      return false;
    }
    Long size = item.size();
    return size == null || size <= DROPBOX_MAX_BYTES;
  }

  private static boolean image(CloudItem item) {
    return mime(item).startsWith("image/") || IMAGE_EXTENSIONS.contains(extension(item));
  }

  private static boolean pdf(CloudItem item) {
    return "application/pdf".equals(mime(item)) || "pdf".equals(extension(item));
  }

  private static boolean office(CloudItem item) {
    String extension = extension(item);
    return WORD_EXTENSIONS.contains(extension)
        || EXCEL_EXTENSIONS.contains(extension)
        || POWERPOINT_EXTENSIONS.contains(extension);
  }

  private static boolean googleNative(CloudProvider provider, CloudItem item) {
    if (provider != CloudProvider.GOOGLE_DRIVE) {
      return false;
    }
    String mime = mime(item);
    return GOOGLE_DOCUMENT.equals(mime) || GOOGLE_SPREADSHEET.equals(mime) || GOOGLE_PRESENTATION.equals(mime);
  }

  private static boolean text(CloudProvider provider, CloudItem item) {
    if (provider == CloudProvider.ONEDRIVE) {
      return ONEDRIVE_TEXT_EXTENSIONS.contains(extension(item));
    }
    return provider == CloudProvider.GOOGLE_DRIVE && DRIVE_TEXT_EXTENSIONS.contains(extension(item));
  }

  private static String extension(CloudItem item) {
    return item.extension() == null ? "" : item.extension().toLowerCase(Locale.ROOT);
  }

  private static String mime(CloudItem item) {
    return item.mimeType() == null ? "" : item.mimeType().toLowerCase(Locale.ROOT);
  }
}
