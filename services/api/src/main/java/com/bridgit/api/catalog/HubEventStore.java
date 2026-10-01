package com.bridgit.api.catalog;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class HubEventStore {
  private final JdbcTemplate jdbc;
  private final HubJson json;
  private final Clock clock;
  public HubEventStore(JdbcTemplate jdbc, HubJson json, Clock clock) {
    this.jdbc = jdbc; this.json = json; this.clock = clock;
  }
  public void append(UUID user, UUID connection, long generation, String type, Object payload) {
    jdbc.update("INSERT INTO cloud_events(user_id,connection_id,generation,event_type,payload,created_at) VALUES(?,?,?,?,?,?)",
        user.toString(), connection.toString(), generation, type, json.write(payload), OffsetDateTime.now(clock));
  }
  public List<Event> since(UUID user, long sequence) {
    return jdbc.query("SELECT TOP (200) * FROM cloud_events WHERE user_id=? AND sequence>? ORDER BY sequence",
        (rs, row) -> new Event(rs.getLong("sequence"), rs.getString("connection_id"), rs.getLong("generation"),
            rs.getString("event_type"), json.read(rs.getString("payload"), Object.class)), user.toString(), sequence);
  }
  public long latest(UUID user) {
    return jdbc.queryForObject("SELECT COALESCE(MAX(sequence),0) FROM cloud_events WHERE user_id=?", Long.class, user.toString());
  }
  public record Event(long sequence, String connectionId, long generation, String type, Object payload) {}
}
