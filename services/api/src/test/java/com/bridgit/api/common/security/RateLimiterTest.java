package com.bridgit.api.common.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class RateLimiterTest {

  private final MutableClock clock = new MutableClock(Instant.parse("2026-01-01T00:00:00Z"));

  @Test
  void blocksAfterMaxEventsUntilTheWindowPasses() {
    RateLimiter limiter = new RateLimiter(3, Duration.ofMinutes(15), 100, clock);
    for (int i = 0; i < 3; i++) {
      assertEquals(0, limiter.retryAfterSeconds("a"));
      limiter.record("a");
    }

    long retry = limiter.retryAfterSeconds("a");
    assertTrue(retry > 0 && retry <= 15 * 60 + 1, "retry=" + retry);
    assertEquals(0, limiter.retryAfterSeconds("b"));

    clock.advance(Duration.ofMinutes(15));
    assertEquals(0, limiter.retryAfterSeconds("a"));
  }

  @Test
  void resetClearsTheKey() {
    RateLimiter limiter = new RateLimiter(1, Duration.ofMinutes(1), 100, clock);
    limiter.record("a");
    assertTrue(limiter.retryAfterSeconds("a") > 0);
    limiter.reset("a");
    assertEquals(0, limiter.retryAfterSeconds("a"));
  }

  @Test
  void staysBoundedByMaxKeys() {
    RateLimiter limiter = new RateLimiter(1, Duration.ofMinutes(1), 2, clock);
    limiter.record("a");
    limiter.record("b");
    limiter.record("c");
    // The map was full of live keys, so it was cleared before "c" went in.
    assertEquals(0, limiter.retryAfterSeconds("a"));
    assertTrue(limiter.retryAfterSeconds("c") > 0);
  }

  private static final class MutableClock extends Clock {
    private Instant now;

    MutableClock(Instant now) {
      this.now = now;
    }

    void advance(Duration duration) {
      now = now.plus(duration);
    }

    @Override
    public ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return now;
    }
  }
}
