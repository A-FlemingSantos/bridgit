package com.bridgit.api.integrations.avatar;

import java.util.Optional;
import java.util.UUID;

/** Persistence of provider_connection_avatars, one row per connection. */
public interface ConnectionAvatarStore {

  Optional<StoredAvatar> find(UUID connectionId);

  /** Inserts or replaces the row of the connection. */
  void save(UUID connectionId, StoredAvatar avatar);
}
