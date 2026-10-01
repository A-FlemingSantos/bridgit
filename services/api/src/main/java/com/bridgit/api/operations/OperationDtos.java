package com.bridgit.api.operations;

import com.bridgit.api.providers.CloudItem;
import java.time.OffsetDateTime;
import java.util.UUID;

public final class OperationDtos {
  private OperationDtos() {}
  public enum Kind { CREATE_FOLDER, UPLOAD, UPDATE, DELETE }
  public record Request(String clientKey, String provider, UUID connectionId, Long generation,
      Kind kind, String ref, String parentRef, String name, String contentType,
      String expectedVersion, UUID dependencyId) {}
  public record View(UUID id, String status, Request request, CloudItem item, String errorCode,
      String errorMessage, int attempts, OffsetDateTime createdAt, OffsetDateTime updatedAt, long sequence) {
    public boolean terminal() { return "SUCCEEDED".equals(status) || "REJECTED".equals(status) || "NEEDS_ATTENTION".equals(status); }
  }
}
