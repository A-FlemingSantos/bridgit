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
      String lastError,
      java.util.UUID connectionId,
      Long generation,
      String syncState,
      boolean operationsEnabled
  ) {
    public ProviderStatus(String id, String name, boolean configured, boolean connected,
        ProviderAccountSummary account, OffsetDateTime connectedAt, String lastError) {
      this(id, name, configured, connected, account, connectedAt, lastError, null, null, null, false);
    }
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
