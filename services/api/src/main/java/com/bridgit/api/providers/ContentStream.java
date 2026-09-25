package com.bridgit.api.providers;

import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;

public record ContentStream(
    InputStream body,
    String contentType,
    Long contentLength,
    String fileName
) implements Closeable {

  @Override
  public void close() throws IOException {
    if (body != null) {
      body.close();
    }
  }
}
