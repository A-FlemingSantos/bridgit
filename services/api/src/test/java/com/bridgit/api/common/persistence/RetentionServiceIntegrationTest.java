package com.bridgit.api.common.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import com.bridgit.api.ApiIntegrationTestSupport;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class RetentionServiceIntegrationTest extends ApiIntegrationTestSupport {
  @Autowired RetentionService retention;
  @Autowired JdbcTemplate jdbc;

  private final OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
  private UUID userId;

  @BeforeEach
  void user() {
    userId = UUID.randomUUID();
    jdbc.update("INSERT INTO users(id,created_at,updated_at,username,username_key,password_hash) "
        + "VALUES (?,?,?,?,?,?)", userId, now, now, "retention", "retention", "x");
  }

  @Test
  void removesOnlyEventsOlderThanRetention() {
    event(now.minusDays(8));
    event(now.minusDays(6));
    event(now);
    retention.purge();
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cloud_events", Integer.class)).isEqualTo(2);
    assertThat(jdbc.queryForObject(
        "SELECT COUNT(*) FROM cloud_events WHERE created_at < ?", Integer.class, now.minusDays(7)))
        .isZero();
  }

  @Test
  void removesRevokedAndLongExpiredSessionsButKeepsLiveOnes() {
    UUID oldRevoked = session("WEB", true, now.minusDays(40), now.minusDays(40), now.minusDays(31));
    UUID recentRevoked = session("WEB", true, now.minusDays(2), now.minusDays(2), now.minusDays(1));
    UUID oldMobileRevoked = session("MOBILE", true, now.minusDays(60), now.minusDays(60), now.minusDays(35));
    UUID expiredRemembered = session("WEB", true, now.minusDays(40), now.minusDays(40), null);
    UUID recentlyExpiredRemembered = session("WEB", true, now.minusDays(10), now.minusDays(10), null);
    UUID liveRemembered = session("WEB", true, now.minusDays(3), now.minusDays(3), null);
    UUID expiredWindow = session("WEB", false, now.minusDays(40), now.minusDays(40), null);
    UUID recentlyExpiredWindow = session("WEB", false, now.minusDays(5), now.minusDays(5), null);
    UUID liveWindow = session("WEB", false, now.minusDays(40), now.minusMinutes(30), null);
    UUID oldMobile = session("MOBILE", true, now.minusDays(400), now.minusDays(400), null);

    retention.purge();

    assertThat(remainingSessions()).containsExactlyInAnyOrder(
        recentRevoked, recentlyExpiredRemembered, liveRemembered, recentlyExpiredWindow, liveWindow, oldMobile);
    assertThat(remainingSessions()).doesNotContain(
        oldRevoked, oldMobileRevoked, expiredRemembered, expiredWindow);
  }

  @Test
  void removesUsedAndExpiredOauthStatesAfterGracePeriod() {
    UUID oldUsed = state(now.minusDays(2), now.minusDays(2).plusMinutes(10), now.minusDays(2).plusMinutes(1));
    UUID recentUsed = state(now.minusHours(3), now.plusMinutes(7), now.minusHours(2));
    UUID oldExpired = state(now.minusDays(3), now.minusDays(3).plusMinutes(10), null);
    UUID recentExpired = state(now.minusHours(2), now.minusHours(1), null);
    UUID pending = state(now.minusMinutes(1), now.plusMinutes(9), null);

    retention.purge();

    List<UUID> left = jdbc.query("SELECT id FROM provider_oauth_states",
        (rs, row) -> UUID.fromString(rs.getString(1)));
    assertThat(left).containsExactlyInAnyOrder(recentUsed, recentExpired, pending);
    assertThat(left).doesNotContain(oldUsed, oldExpired);
  }

  @Test
  void removesMoreThanOneBatch() {
    jdbc.update("INSERT INTO cloud_events(user_id,connection_id,generation,event_type,payload,created_at) "
        + "SELECT TOP (2500) ?, ?, 1, 'test', '{}', ? FROM sys.all_columns a CROSS JOIN sys.all_columns b",
        userId, UUID.randomUUID(), now.minusDays(30));
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cloud_events", Integer.class)).isEqualTo(2500);
    retention.purge();
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cloud_events", Integer.class)).isZero();
  }

  private List<UUID> remainingSessions() {
    return jdbc.query("SELECT id FROM user_sessions", (rs, row) -> UUID.fromString(rs.getString(1)));
  }

  private void event(OffsetDateTime createdAt) {
    jdbc.update("INSERT INTO cloud_events(user_id,connection_id,generation,event_type,payload,created_at) "
        + "VALUES (?,?,1,'test','{}',?)", userId, UUID.randomUUID(), createdAt);
  }

  private UUID session(String kind, boolean persistent, OffsetDateTime created, OffsetDateTime seen,
      OffsetDateTime revoked) {
    UUID id = UUID.randomUUID();
    OffsetDateTime window = "WEB".equals(kind) && !persistent ? seen : created;
    jdbc.update("INSERT INTO user_sessions(id,created_at,updated_at,user_id,device_key,persistent,"
            + "last_seen_at,revoked_at,client_kind,window_started_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        id, created, seen, userId, UUID.randomUUID(), persistent, seen, revoked, kind, window);
    return id;
  }

  private UUID state(OffsetDateTime created, OffsetDateTime expires, OffsetDateTime used) {
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO provider_oauth_states(id,created_at,updated_at,user_id,provider,state_token,"
            + "code_verifier,expires_at,used_at) VALUES (?,?,?,?,'dropbox',?,'v',?,?)",
        id, created, created, userId, UUID.randomUUID().toString(), expires, used);
    return id;
  }
}
