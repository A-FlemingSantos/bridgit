package com.bridgit.api.providers;

import java.util.Locale;
import java.util.Set;

public final class ReadPlanSupport {

  public static final long EDIT_MAX_BYTES = 2L * 1024L * 1024L;

  private static final long TEXT_MAX_BYTES = EDIT_MAX_BYTES;

  private static final Set<String> TEXT_EXTENSIONS = Set.of(
      "json", "xml", "md", "markdown", "csv", "log", "yml", "yaml",
      "txt", "text", "ini", "cfg", "conf", "properties",
      "java", "js", "jsx", "ts", "tsx", "mjs", "cjs",
      "py", "rb", "go", "rs", "c", "cc", "cpp", "h", "hpp", "cs",
      "php", "swift", "kt", "kts", "scala", "sh", "bash", "zsh",
      "sql", "html", "htm", "css", "scss", "less", "sass",
      "vue", "svelte", "toml", "env", "dockerfile", "gitignore",
      "gradle", "groovy", "lua", "r", "pl", "pm", "ex", "exs",
      "clj", "cljs", "erl", "hrl", "fs", "fsx", "vb", "vbs",
      "ps1", "bat", "cmd", "asm", "s", "dart", "elm", "hs",
      "ml", "mli", "nim", "pas", "pp", "proto", "tf", "tfvars"
  );

  private static final Set<String> ONEDRIVE_PDF_EXTENSIONS = Set.of(
      "csv", "doc", "docx", "odp", "ods", "odt", "pot", "potm", "potx",
      "pps", "ppsx", "ppsxm", "ppt", "pptm", "pptx", "rtf", "xls", "xlsx"
  );

  private static final Set<String> GOOGLE_NATIVE_MIMES = Set.of(
      "application/vnd.google-apps.document",
      "application/vnd.google-apps.spreadsheet",
      "application/vnd.google-apps.presentation",
      "application/vnd.google-apps.drawing"
  );

  private static final String GOOGLE_APPS_PREFIX = "application/vnd.google-apps.";

  private static final Set<String> DROPBOX_PREVIEW_EXTENSIONS = Set.of(
      "ai", "doc", "docm", "docx", "eps", "gdoc", "gslides", "odp", "odt",
      "pps", "ppsm", "ppsx", "ppt", "pptm", "pptx", "rtf"
  );

  private ReadPlanSupport() {
  }

  public static ReadPlan readPlan(CloudProvider provider, CloudItem item) {
    if (item.kind() == ItemKind.FOLDER) {
      return none();
    }

    String mime = normalizeMime(item.mimeType());
    String ext = item.extension();

    // Google-native items have no bytes of their own, so the name's extension says nothing about
    // them (a shortcut or form named "x.pdf" is not a PDF): only exportable types are readable.
    if (mime.startsWith(GOOGLE_APPS_PREFIX)) {
      return googleNative(mime);
    }

    if (mime.startsWith("image/")) {
      return new ReadPlan(ReadMode.IMAGE, ContentVariant.ORIGINAL, mime);
    }
    if ("application/pdf".equals(mime) || "pdf".equals(ext)) {
      return new ReadPlan(ReadMode.PDF, ContentVariant.ORIGINAL, "application/pdf");
    }
    if (mime.startsWith("text/") || isTextExtension(ext)) {
      if (item.size() != null && item.size() > TEXT_MAX_BYTES) {
        return none();
      }
      String contentType = mime.startsWith("text/") ? mime : "text/plain";
      return new ReadPlan(ReadMode.TEXT, ContentVariant.ORIGINAL, contentType);
    }
    if (mime.startsWith("video/")) {
      return new ReadPlan(ReadMode.VIDEO, ContentVariant.ORIGINAL, mime);
    }
    if (mime.startsWith("audio/")) {
      return new ReadPlan(ReadMode.AUDIO, ContentVariant.ORIGINAL, mime);
    }

    return switch (provider) {
      case ONEDRIVE -> onedriveOffice(ext, mime);
      case GOOGLE_DRIVE -> none();
      case DROPBOX -> dropboxPreview(ext);
    };
  }

  private static ReadPlan onedriveOffice(String ext, String mime) {
    if (ext != null && ONEDRIVE_PDF_EXTENSIONS.contains(ext)) {
      return new ReadPlan(ReadMode.PDF, ContentVariant.READ, "application/pdf");
    }
    if (mime.contains("officedocument") || mime.contains("msword") || mime.contains("ms-excel")
        || mime.contains("ms-powerpoint") || mime.contains("opendocument")) {
      return new ReadPlan(ReadMode.PDF, ContentVariant.READ, "application/pdf");
    }
    return none();
  }

  private static ReadPlan googleNative(String mime) {
    if (GOOGLE_NATIVE_MIMES.contains(mime)) {
      return new ReadPlan(ReadMode.PDF, ContentVariant.READ, "application/pdf");
    }
    // shortcut, form, site, map, folder and the like: no exportable content, so no reading
    return none();
  }

  private static ReadPlan dropboxPreview(String ext) {
    if (ext != null && DROPBOX_PREVIEW_EXTENSIONS.contains(ext)) {
      return new ReadPlan(ReadMode.PDF, ContentVariant.READ, "application/pdf");
    }
    return none();
  }

  private static boolean isTextExtension(String ext) {
    return ext != null && TEXT_EXTENSIONS.contains(ext.toLowerCase(Locale.ROOT));
  }

  private static String normalizeMime(String mimeType) {
    return mimeType == null ? "" : mimeType.toLowerCase(Locale.ROOT);
  }

  private static ReadPlan none() {
    return new ReadPlan(ReadMode.NONE, ContentVariant.ORIGINAL, null);
  }

  /** Text files small enough to be opened in the editor and saved back whole. */
  public static boolean isEditableText(CloudProvider provider, CloudItem item) {
    return item != null
        && readPlan(provider, item).mode() == ReadMode.TEXT
        && item.size() != null && item.size() <= EDIT_MAX_BYTES
        && org.springframework.util.StringUtils.hasText(item.contentRevision());
  }

  public static boolean isGoogleNative(String mimeType) {
    return GOOGLE_NATIVE_MIMES.contains(normalizeMime(mimeType));
  }
}
