package com.bridgit.api.common.persistence;

import java.time.Clock;
import java.time.OffsetDateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Periodic retention for tables that otherwise only grow: old {@code cloud_events}, revoked or
 * long-expired {@code user_sessions} and used or expired {@code provider_oauth_states}. Rows are
 * removed in small batches (with a per-run cap) so the job never holds the database for long, and
 * each table is isolated so a failure in one does not stop the others.
 */
@Service
public class RetentionService {
  private static final Logger log = LoggerFactory.getLogger(RetentionService.class);
  static final int BATCH_SIZE = 1000;
  static final int MAX_BATCHES_PER_TABLE = 50;
  // Mirrors UserSessionService: remembered web sessions expire 7 days after last use,
  // unremembered web sessions 2 hours after the window started, mobile sessions never expire.
  private static final long REMEMBERED_IDLE_LIMIT_DAYS = 7;
  private static final long UNREMEMBERED_WINDOW_HOURS = 2;

  static final String EVENTS_SQL =
      "DELETE TOP (" + BATCH_SIZE + ") FROM cloud_events WHERE created_at < ?";
  static final String SESSIONS_SQL =
      "DELETE TOP (" + BATCH_SIZE + ") FROM user_sessions WHERE revoked_at < ? "
          + "OR (client_kind <> 'MOBILE' AND persistent = 1 AND last_seen_at < DATEADD(DAY, -"
          + REMEMBERED_IDLE_LIMIT_DAYS + ", ?)) "
          + "OR (client_kind <> 'MOBILE' AND persistent = 0 AND window_started_at < DATEADD(HOUR, -"
          + UNREMEMBERED_WINDOW_HOURS + ", ?))";
  static final String OAUTH_STATES_SQL =
      "DELETE TOP (" + BATCH_SIZE + ") FROM provider_oauth_states "
          + "WHERE COALESCE(used_at, expires_at) < ?";

  private final JdbcTemplate jdbc;
  private final Clock clock;
  private final boolean enabled;
  private final long eventsDays;
  private final long sessionsDays;
  private final long oauthStatesHours;

  public RetentionService(
      JdbcTemplate jdbc,
      Clock clock,
      @Value("${app.hub.retention.enabled:true}") boolean enabled,
      @Value("${app.hub.retention.events-days:7}") long eventsDays,
      @Value("${app.hub.retention.sessions-days:30}") long sessionsDays,
      @Value("${app.hub.retention.oauth-states-hours:24}") long oauthStatesHours) {
    this.jdbc = jdbc;
    this.clock = clock;
    this.enabled = enabled;
    this.eventsDays = eventsDays;
    this.sessionsDays = sessionsDays;
    this.oauthStatesHours = oauthStatesHours;
  }

  @Scheduled(
      fixedDelayString = "${app.hub.retention.poll-ms:3600000}",
      initialDelayString = "${app.hub.retention.initial-delay-ms:60000}")
  public void scheduledPurge() {
    if (enabled) {
      purge();
    }
  }

  /** Runs every cleanup once; never throws. */
  public void purge() {
    OffsetDateTime now = OffsetDateTime.now(clock);
    OffsetDateTime eventsCutoff = now.minusDays(eventsDays);
    OffsetDateTime sessionsCutoff = now.minusDays(sessionsDays);
    OffsetDateTime statesCutoff = now.minusHours(oauthStatesHours);
    run("cloud_events", () -> deleteInBatches(EVENTS_SQL, eventsCutoff));
    run("user_sessions",
        () -> deleteInBatches(SESSIONS_SQL, sessionsCutoff, sessionsCutoff, sessionsCutoff));
    run("provider_oauth_states", () -> deleteInBatches(OAUTH_STATES_SQL, statesCutoff));
  }

  private void run(String table, java.util.function.IntSupplier cleanup) {
    try {
      int deleted = cleanup.getAsInt();
      if (deleted > 0) {
        log.info("Retention removed {} rows from {}", deleted, table);
      }
    } catch (RuntimeException ex) {
      log.warn("Retention cleanup of {} failed: {}", table, ex.getMessage());
    }
  }

  private int deleteInBatches(String sql, Object... args) {
    int total = 0;
    for (int batch = 0; batch < MAX_BATCHES_PER_TABLE; batch++) {
      int deleted = jdbc.update(sql, args);
      total += deleted;
      if (deleted < BATCH_SIZE) {
        break;
      }
    }
    return total;
  }
}
