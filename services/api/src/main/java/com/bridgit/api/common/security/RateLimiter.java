package com.bridgit.api.common.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Sliding-window counter kept in memory, per key. It only holds within one API instance,
 * which is the planned deploy (a single VM).
 */
public class RateLimiter {

  private final int maxEvents;
  private final Duration window;
  private final int maxKeys;
  private final Clock clock;
  private final Map<String, Deque<Instant>> events = new ConcurrentHashMap<>();

  public RateLimiter(int maxEvents, Duration window, int maxKeys, Clock clock) {
    this.maxEvents = maxEvents;
    this.window = window;
    this.maxKeys = maxKeys;
    this.clock = clock;
  }

  /** Seconds until the key may act again, or 0 when it is under the limit. */
  public long retryAfterSeconds(String key) {
    Deque<Instant> recent = events.get(key);
    if (recent == null) return 0;
    synchronized (recent) {
      Instant now = Instant.now(clock);
      prune(recent, now);
      if (recent.size() < maxEvents) return 0;
      Instant freeAt = recent.peekFirst().plus(window);
      return Math.max(1, Duration.between(now, freeAt).toSeconds() + 1);
    }
  }

  public void record(String key) {
    if (events.size() >= maxKeys) evictExpired();
    Deque<Instant> recent = events.computeIfAbsent(key, ignored -> new ArrayDeque<>());
    synchronized (recent) {
      Instant now = Instant.now(clock);
      prune(recent, now);
      recent.addLast(now);
    }
  }

  public void reset(String key) {
    events.remove(key);
  }

  private void evictExpired() {
    Instant now = Instant.now(clock);
    events.entrySet().removeIf(entry -> {
      synchronized (entry.getValue()) {
        prune(entry.getValue(), now);
        return entry.getValue().isEmpty();
      }
    });
    // Still full: drop everything rather than grow without bound. Limits fail open for a moment.
    if (events.size() >= maxKeys) events.clear();
  }

  private void prune(Deque<Instant> recent, Instant now) {
    Instant cutoff = now.minus(window);
    while (!recent.isEmpty() && !recent.peekFirst().isAfter(cutoff)) {
      recent.pollFirst();
    }
  }
}
