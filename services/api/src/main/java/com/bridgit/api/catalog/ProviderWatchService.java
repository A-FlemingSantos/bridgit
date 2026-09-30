package com.bridgit.api.catalog;

import com.bridgit.api.integrations.*;
import com.bridgit.api.providers.*;
import com.bridgit.api.providers.sync.*;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class ProviderWatchService {
  private final JdbcTemplate jdbc;
  private final CatalogStore catalog;
  private final ProviderConnectionRepository connections;
  private final CloudProviderClients clients;
  private final ProviderRetryService retry;
  private final LocalHubProperties properties;
  private final Clock clock;
  public ProviderWatchService(JdbcTemplate jdbc, CatalogStore catalog, ProviderConnectionRepository connections,
      CloudProviderClients clients, ProviderRetryService retry, LocalHubProperties properties, Clock clock) {
    this.jdbc = jdbc; this.catalog = catalog; this.connections = connections; this.clients = clients; this.retry = retry; this.properties = properties; this.clock = clock;
  }
  @Scheduled(fixedDelayString = "${app.hub.watch-poll-ms:60000}")
  public void renew() {
    if (!properties.isWorkerEnabled() || !properties.isCatalogEnabled() || !properties.getWebhookBaseUrl().startsWith("https://")) return;
    for (ProviderConnectionEntity c : connections.findAll()) {
      CloudProviderClient client = clients.get(CloudProvider.fromId(c.getProvider()));
      if (!(client instanceof CloudWatchClient watch)) continue;
      try {
        catalog.ensure(c);
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT watch_id,watch_resource,watch_secret,watch_expires FROM cloud_catalog_state WHERE connection_id=? AND generation=?", c.getId().toString(), c.getGeneration());
        if (rows.isEmpty()) continue;
        Map<String, Object> row = rows.getFirst();
        OffsetDateTime expires = jdbc.queryForObject("SELECT watch_expires FROM cloud_catalog_state WHERE connection_id=?", (rs, n) -> rs.getObject(1, OffsetDateTime.class), c.getId().toString());
        if (expires != null && expires.isAfter(OffsetDateTime.now(clock).plusMinutes(10))) continue;
        String secret = row.get("watch_secret") == null ? UUID.randomUUID().toString() : row.get("watch_secret").toString();
        jdbc.update("UPDATE cloud_catalog_state SET watch_secret=? WHERE connection_id=? AND generation=?", secret, c.getId().toString(), c.getGeneration());
        WatchRegistration previous = row.get("watch_id") == null ? null : new WatchRegistration(row.get("watch_id").toString(), Objects.toString(row.get("watch_resource"), null), expires == null ? clock.instant() : expires.toInstant());
        String callback = properties.getWebhookBaseUrl().replaceAll("/+$", "") + "/api/webhooks/" + c.getProvider() + "/" + c.getId();
        WatchRegistration registration = retry.withRetry(c, token -> watch.watch(token, callback, secret, previous));
        jdbc.update("UPDATE cloud_catalog_state SET watch_id=?,watch_resource=?,watch_expires=? WHERE connection_id=? AND generation=?",
            registration.id(), registration.resourceId(), OffsetDateTime.ofInstant(registration.expiresAt(), ZoneOffset.UTC), c.getId().toString(), c.getGeneration());
      } catch (RuntimeException ex) {
        // Expired/unavailable watches degrade to incremental polling; no catalog data is discarded.
        jdbc.update("UPDATE cloud_catalog_state SET watch_expires=NULL,watch_id=NULL WHERE connection_id=? AND generation=?", c.getId().toString(), c.getGeneration());
      }
    }
  }
  public boolean matches(UUID connection, String secret, String watchId, String resourceId) {
    if (secret == null) return false;
    List<Map<String, Object>> rows = jdbc.queryForList("SELECT s.watch_secret,s.watch_id,s.watch_resource FROM cloud_catalog_state s JOIN provider_connections c ON c.id=s.connection_id AND c.generation=s.generation WHERE c.id=?", connection.toString());
    if (rows.isEmpty()) return false;
    Map<String, Object> row = rows.getFirst();
    boolean valid = java.security.MessageDigest.isEqual(secret.getBytes(java.nio.charset.StandardCharsets.UTF_8), Objects.toString(row.get("watch_secret"), "").getBytes(java.nio.charset.StandardCharsets.UTF_8));
    return valid && (watchId == null || Objects.equals(watchId, row.get("watch_id"))) && (resourceId == null || Objects.equals(resourceId, row.get("watch_resource")));
  }
  public void changed(UUID connection) { catalog.schedule(connection); }
  public void dropboxChanged(String account) {
    jdbc.query("SELECT id FROM provider_connections WHERE provider='dropbox' AND account_id=?", (rs, row) -> UUID.fromString(rs.getString(1)), account).forEach(catalog::schedule);
  }
}
