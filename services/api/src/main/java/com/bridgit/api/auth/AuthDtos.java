package com.bridgit.api.auth;

import java.time.OffsetDateTime;
import java.util.UUID;

public final class AuthDtos {

  private AuthDtos() {
  }

  public record SessionResponse(
      String accessToken,
      OffsetDateTime expiresAt,
      UserSummary user,
      SessionSummary session
  ) {
  }

  public record UserSummary(
      UUID id,
      String username
  ) {
  }

  public record SessionSummary(
      UUID id,
      boolean persistent
  ) {
  }

  public record MessageResponse(String message) {
  }

  public record AccountResponse(
      UUID id,
      String username
  ) {
  }
}
