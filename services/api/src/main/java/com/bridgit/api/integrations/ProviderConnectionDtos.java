package com.bridgit.api.integrations;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class ProviderConnectionDtos {

  private ProviderConnectionDtos() {
  }

  public record ProviderAccountSummary(
      String email,
      String name
  ) {
  }

  /** One connected account. A provider may have several, oldest first. */
  public record ConnectionStatus(
      UUID connectionId,
      String provider,
      String providerName,
      ProviderAccountSummary account,
      OffsetDateTime connectedAt,
      OffsetDateTime createdAt,
      String lastError,
      long generation,
      String syncState,
      boolean operationsEnabled
  ) {
  }

  /**
   * One row per provider. The top-level account fields describe the oldest connection, so clients
   * that predate multiple accounts keep working; {@code connections} lists every account.
   */
  public record ProviderStatus(
      String id,
      String name,
      boolean configured,
      boolean connected,
      ProviderAccountSummary account,
      OffsetDateTime connectedAt,
      String lastError,
      UUID connectionId,
      Long generation,
      String syncState,
      boolean operationsEnabled,
      List<ConnectionStatus> connections
  ) {
    public ProviderStatus {
      connections = connections == null ? List.of() : List.copyOf(connections);
    }

    public ProviderStatus(String id, String name, boolean configured, boolean connected,
        ProviderAccountSummary account, OffsetDateTime connectedAt, String lastError,
        UUID connectionId, Long generation, String syncState, boolean operationsEnabled) {
      this(id, name, configured, connected, account, connectedAt, lastError, connectionId, generation,
          syncState, operationsEnabled, List.of());
    }

    public ProviderStatus(String id, String name, boolean configured, boolean connected,
        ProviderAccountSummary account, OffsetDateTime connectedAt, String lastError) {
      this(id, name, configured, connected, account, connectedAt, lastError, null, null, null, false, List.of());
    }
  }

  public record AuthorizationResponse(
      String authorizationUrl
  ) {
  }

  /**
   * {@code addAccount} asks the provider to show its account picker (or a fresh sign-in where there
   * is no picker). {@code allowAccountChange} is accepted from older clients and ignored.
   */
  public record ConnectRequest(
      String redirectTo,
      Boolean allowAccountChange,
      Boolean addAccount
  ) {
  }
}
