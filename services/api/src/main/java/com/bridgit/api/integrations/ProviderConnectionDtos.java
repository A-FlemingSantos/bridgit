package com.bridgit.api.integrations;

import java.time.OffsetDateTime;

public final class ProviderConnectionDtos {

  private ProviderConnectionDtos() {
  }

  public record ProviderAccountSummary(
      String email,
      String name
  ) {
  }

  public record ProviderStatus(
      String id,
      String name,
      boolean configured,
      boolean connected,
      ProviderAccountSummary account,
      OffsetDateTime connectedAt,
      String lastError
  ) {
  }

  public record AuthorizationResponse(
      String authorizationUrl
  ) {
  }

  public record ConnectRequest(
      String redirectTo
  ) {
  }
}
