package com.bridgit.api.common.api;

/**
 * The largest file the hub accepts. spring.servlet.multipart.max-file-size in application.yml
 * must match, and the clients mirror it in @bridgit/shared-client (MAX_UPLOAD_BYTES).
 */
public final class UploadLimits {

  public static final long MAX_BYTES = 50L * 1024 * 1024;
  public static final String MAX_LABEL = "50 MB";

  private UploadLimits() {
  }
}
