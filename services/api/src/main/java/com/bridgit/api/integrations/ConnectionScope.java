package com.bridgit.api.integrations;

import com.bridgit.api.providers.CloudProvider;
import java.util.UUID;

/**
 * The connection a request acts on, already ownership-checked. Resolved from the
 * {@code connectionId} path variable, or from {@code provider} (its oldest connection) on the
 * provider-keyed routes kept for older clients. The entity is detached: re-read it by id before
 * changing it.
 */
public record ConnectionScope(UUID userId, ProviderConnectionEntity connection, CloudProvider provider) {

  public static ConnectionScope of(UUID userId, ProviderConnectionEntity connection) {
    return new ConnectionScope(userId, connection, CloudProvider.fromId(connection.getProvider()));
  }

  public UUID connectionId() {
    return connection.getId();
  }
}
