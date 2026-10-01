package com.bridgit.api.catalog;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import org.springframework.stereotype.Component;

/** One remote write/sync round per connection; durable claims still fence process restarts. */
@Component
public class ConnectionWork {
  private final ConcurrentHashMap<UUID, ReentrantLock> locks = new ConcurrentHashMap<>();
  public ReentrantLock lock(UUID connection) { return locks.computeIfAbsent(connection, key -> new ReentrantLock(true)); }
}
