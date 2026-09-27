package com.bridgit.api.providers;

import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;

public record ContentStream(
    InputStream body,
    String contentType,
    Long contentLength,
    String fileName,
    int status,
    String contentRange,
    Long totalSize
) implements Closeable {

  public ContentStream(InputStream body, String contentType, Long contentLength, String fileName) {
    this(body, contentType, contentLength, fileName, 200, null, contentLength);
  }

  public boolean partial() {
    return status == 206;
  }

  @Override
  public void close() throws IOException {
    if (body != null) {
      body.close();
    }
  }
}
