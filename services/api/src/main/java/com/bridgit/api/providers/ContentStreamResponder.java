package com.bridgit.api.providers;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

@Component
public class ContentStreamResponder {

  public void write(ContentStream stream, HttpServletResponse response, boolean attachment) throws IOException {
    write(stream, response, attachment, Map.of());
  }

  public void write(
      ContentStream stream,
      HttpServletResponse response,
      boolean attachment,
      Map<String, String> extraHeaders
  ) throws IOException {
    boolean ranged = stream.status() == 206 && stream.contentRange() != null;
    if (stream.status() == 416) {
      response.setStatus(HttpServletResponse.SC_REQUESTED_RANGE_NOT_SATISFIABLE);
      response.setHeader("Content-Range", stream.contentRange() != null
          ? stream.contentRange()
          : "bytes */" + (stream.totalSize() == null ? "*" : stream.totalSize()));
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Cache-Control", "private, no-store");
      for (Map.Entry<String, String> header : extraHeaders.entrySet()) {
        response.setHeader(header.getKey(), header.getValue());
      }
      return;
    }

    String contentType = StringUtils.hasText(stream.contentType())
        ? stream.contentType()
        : "application/octet-stream";
    response.setContentType(contentType);

    if (ranged) {
      response.setStatus(HttpServletResponse.SC_PARTIAL_CONTENT);
      response.setHeader("Content-Range", stream.contentRange());
      response.setHeader("Accept-Ranges", "bytes");
    }

    if (stream.contentLength() != null && stream.contentLength() >= 0) {
      response.setContentLengthLong(stream.contentLength());
    }

    String disposition = attachment ? "attachment" : "inline";
    if (StringUtils.hasText(stream.fileName())) {
      String encoded = URLEncoder.encode(stream.fileName(), StandardCharsets.UTF_8).replace("+", "%20");
      disposition += "; filename=\"" + sanitizeFilename(stream.fileName()) + "\"; filename*=UTF-8''" + encoded;
    }
    response.setHeader("Content-Disposition", disposition);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader(
        "Content-Security-Policy",
        "sandbox; default-src 'none'; img-src 'self' data: blob:; media-src 'self' blob:"
    );

    for (Map.Entry<String, String> header : extraHeaders.entrySet()) {
      response.setHeader(header.getKey(), header.getValue());
    }

    try (InputStream input = stream.body(); OutputStream output = response.getOutputStream()) {
      input.transferTo(output);
    }
  }

  public static boolean isTransactionActive() {
    return TransactionSynchronizationManager.isActualTransactionActive();
  }

  private static String sanitizeFilename(String fileName) {
    return fileName.replace("\"", "").replace("\r", "").replace("\n", "");
  }
}
