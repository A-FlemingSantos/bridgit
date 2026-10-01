package com.bridgit.api.operations;

import com.bridgit.api.catalog.*;
import com.bridgit.api.common.error.ConflictException;
import com.bridgit.api.common.error.NotFoundException;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.sync.PreparedWrite;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Repository
public class OperationStore {
  private final JdbcTemplate jdbc;
  private final HubJson json;
  private final HubEventStore events;
  private final CatalogStore catalog;
  private final Clock clock;
  private final TransactionTemplate tx;
  public record Payload(String path, long size, String hash) {}
  public record Stored(UUID id, UUID userId, UUID connectionId, long generation,
      String status, OperationDtos.Request request, CloudItem result, PreparedWrite prepared,
      CloudItem base, String errorCode, String errorMessage, int attempts,
      OffsetDateTime createdAt, OffsetDateTime updatedAt, Payload payload, long sequence) {
    public OperationDtos.View view() { return new OperationDtos.View(id, status, request, result, errorCode, errorMessage, attempts, createdAt, updatedAt, sequence); }
  }
  public OperationStore(JdbcTemplate jdbc, HubJson json, HubEventStore events, CatalogStore catalog,
      Clock clock, PlatformTransactionManager transactions) {
    this.jdbc = jdbc; this.json = json; this.events = events; this.catalog = catalog; this.clock = clock;
    tx = new TransactionTemplate(transactions);
  }

  public Stored accept(UUID user, ProviderConnectionEntity c, OperationDtos.Request request, Payload payload) {
    String encoded = json.write(request);
    String hash = HubJson.hash(encoded + (payload == null ? "" : ":" + payload.size() + ":" + payload.hash()));
    return tx.execute(status -> {
      jdbc.queryForList("SELECT id FROM users WITH(UPDLOCK,ROWLOCK) WHERE id=?", user.toString());
      List<String> existing = jdbc.query("SELECT request_hash FROM cloud_operations WHERE user_id=? AND client_key=?",
          (rs, row) -> rs.getString(1), user.toString(), request.clientKey());
      if (!existing.isEmpty()) {
        if (!existing.getFirst().equals(hash)) throw new ConflictException("OPERACAO_DIFERENTE", "Esta operacao ja foi recebida com outros dados.");
        return byClientKey(user, request.clientKey());
      }
      UUID id = UUID.randomUUID();
      OffsetDateTime now = now();
      jdbc.update("INSERT INTO cloud_operations(id,user_id,connection_id,generation,provider,client_key,request_hash,request_json,kind,status,created_at,updated_at,next_run,payload_path,payload_size,payload_hash) VALUES(?,?,?,?,?,?,?,?,?,'QUEUED',?,?,?,?,?,?)",
          id.toString(), user.toString(), c.getId().toString(), c.getGeneration(), c.getProvider(), request.clientKey(), hash, encoded,
          request.kind().name(), now, now, now, payload == null ? null : payload.path(), payload == null ? null : payload.size(), payload == null ? null : payload.hash());
      Stored stored = get(id);
      events.append(user, c.getId(), c.getGeneration(), "operation", stored.view());
      return stored;
    });
  }

  public Stored byClientKey(UUID user, String key) {
    return query("SELECT * FROM cloud_operations WHERE user_id=? AND client_key=?", user.toString(), key).stream().findFirst().orElse(null);
  }
  public Stored get(UUID id) { return query("SELECT * FROM cloud_operations WHERE id=?", id.toString()).stream().findFirst().orElse(null); }
  public Stored reconnect(Stored op, String owner, ProviderConnectionEntity connection) {
    // ProviderConnectionService allocates a new connection ID when the remote account changes.
    if (!op.connectionId().equals(connection.getId()) || !op.userId().equals(connection.getUserId())) throw new IllegalArgumentException("Different connection identity");
    OperationDtos.Request old = op.request();
    OperationDtos.Request rebound = new OperationDtos.Request(old.clientKey(), old.provider(), connection.getId(), connection.getGeneration(), old.kind(), old.ref(), old.parentRef(), old.name(), old.contentType(), old.expectedVersion(), old.dependencyId());
    String status = "VERIFYING".equals(op.status()) || "EXECUTING".equals(op.status()) ? "VERIFYING" : "QUEUED";
    jdbc.update("UPDATE cloud_operations SET generation=?,request_json=?,status=?,updated_at=? WHERE id=? AND lease_owner=? AND generation=?",
        connection.getGeneration(), json.write(rebound), status, now(), op.id().toString(), owner, op.generation());
    return get(op.id());
  }
  public Stored require(UUID user, UUID id) {
    Stored stored = get(id);
    if (stored == null || !stored.userId().equals(user)) throw new NotFoundException("OPERACAO_NAO_ENCONTRADA", "Operacao nao encontrada.");
    return stored;
  }
  public List<OperationDtos.View> pending(UUID user) {
    List<Stored> result = new ArrayList<>(query("SELECT * FROM cloud_operations WHERE user_id=? AND status NOT IN ('SUCCEEDED','REJECTED') ORDER BY operation_sequence", user.toString()));
    result.addAll(query("SELECT TOP (200) * FROM cloud_operations WHERE user_id=? AND status IN ('SUCCEEDED','REJECTED') AND updated_at>? ORDER BY operation_sequence DESC", user.toString(), now().minusHours(24)));
    result.sort(Comparator.comparingLong(Stored::sequence));
    return result.stream().map(Stored::view).toList();
  }
  public List<Stored> due() {
    return query("SELECT TOP (20) o.* FROM cloud_operations o WHERE ((o.status IN ('QUEUED','VERIFYING','WAITING_RECONNECT') AND o.next_run<=?) OR (o.status='EXECUTING' AND o.lease_until<?)) AND NOT EXISTS (SELECT 1 FROM cloud_operations earlier WHERE earlier.connection_id=o.connection_id AND earlier.operation_sequence<o.operation_sequence AND earlier.status IN ('QUEUED','EXECUTING','VERIFYING','WAITING_RECONNECT')) ORDER BY o.operation_sequence", now(), now());
  }
  public boolean claim(UUID id, String owner) {
    return jdbc.update("UPDATE cloud_operations SET status=CASE WHEN status='EXECUTING' THEN 'VERIFYING' ELSE status END,lease_owner=?,lease_until=? WHERE id=? AND status IN ('QUEUED','VERIFYING','WAITING_RECONNECT','EXECUTING') AND (lease_until IS NULL OR lease_until<?) AND NOT EXISTS (SELECT 1 FROM cloud_operations earlier WHERE earlier.connection_id=cloud_operations.connection_id AND earlier.operation_sequence<cloud_operations.operation_sequence AND earlier.status IN ('QUEUED','EXECUTING','VERIFYING','WAITING_RECONNECT'))",
        owner, now().plusMinutes(5), id.toString(), now()) == 1;
  }
  public void prepared(UUID id, String owner, PreparedWrite prepared, CloudItem base) {
    if (jdbc.update("UPDATE cloud_operations SET prepared_json=?,base_json=?,updated_at=? WHERE id=? AND lease_owner=?",
        json.write(prepared), json.write(base), now(), id.toString(), owner) != 1) throw new IllegalStateException("Operation lease lost");
  }
  public void executing(UUID id, String owner) {
    if (jdbc.update("UPDATE cloud_operations SET status='EXECUTING',updated_at=? WHERE id=? AND lease_owner=?",
        now(), id.toString(), owner) != 1) throw new IllegalStateException("Operation lease lost");
  }
  public void beginAttempt(UUID id, String owner) {
    if (jdbc.update("UPDATE cloud_operations SET attempts=attempts+1 WHERE id=? AND lease_owner=?", id.toString(), owner) != 1) throw new IllegalStateException("Operation lease lost");
  }
  public void defer(UUID id, String owner, String status, long delaySeconds, String code, String message) {
    tx.executeWithoutResult(txStatus -> {
      int count = jdbc.update("UPDATE cloud_operations SET status=?,error_code=?,error_message=?,updated_at=?,next_run=?,lease_owner=NULL,lease_until=NULL WHERE id=? AND lease_owner=?",
          status, code, message, now(), now().plusSeconds(delaySeconds), id.toString(), owner);
      if (count == 1) publish(get(id));
    });
  }
  public void success(Stored op, String owner, ProviderConnectionEntity connection, CloudItem result, String deletedRef) {
    tx.executeWithoutResult(status -> {
      int count = jdbc.update("UPDATE cloud_operations SET status='SUCCEEDED',result_json=?,error_code=NULL,error_message=NULL,updated_at=?,lease_owner=NULL,lease_until=NULL WHERE id=? AND lease_owner=?",
          result == null ? null : json.write(result), now(), op.id().toString(), owner);
      if (count != 1) throw new IllegalStateException("Operation lease lost");
      catalog.confirmed(connection, result, deletedRef);
      publish(get(op.id()));
    });
  }
  public void retry(UUID user, UUID id) {
    Stored op = require(user, id);
    if (!"NEEDS_ATTENTION".equals(op.status()) && !"WAITING_RECONNECT".equals(op.status())) return;
    // Attention following an ambiguous call means verify, never blind replay.
    jdbc.update("UPDATE cloud_operations SET status=?,next_run=?,updated_at=?,lease_owner=NULL,lease_until=NULL WHERE id=? AND status=?",
        op.attempts() > 0 ? "VERIFYING" : "QUEUED", now(), now(), id.toString(), op.status());
  }
  public long pendingBytes(UUID user) {
    String sql = "SELECT COALESCE(SUM(payload_size),0) FROM cloud_operations WHERE payload_path IS NOT NULL AND status NOT IN ('SUCCEEDED','REJECTED')";
    return user == null ? jdbc.queryForObject(sql, Long.class) : jdbc.queryForObject(sql + " AND user_id=?", Long.class, user.toString());
  }
  public void payloadRemoved(UUID id) { jdbc.update("UPDATE cloud_operations SET payload_path=NULL WHERE id=? AND status IN ('SUCCEEDED','REJECTED')", id.toString()); }
  public List<Stored> finishedPayloads() { return query("SELECT TOP (100) * FROM cloud_operations WHERE payload_path IS NOT NULL AND status IN ('SUCCEEDED','REJECTED')"); }

  private void publish(Stored op) { events.append(op.userId(), op.connectionId(), op.generation(), "operation", op.view()); }
  private List<Stored> query(String sql, Object... args) {
    return jdbc.query(sql, (rs, row) -> new Stored(UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("user_id")),
        UUID.fromString(rs.getString("connection_id")), rs.getLong("generation"), rs.getString("status"),
        json.read(rs.getString("request_json"), OperationDtos.Request.class), json.read(rs.getString("result_json"), CloudItem.class),
        json.read(rs.getString("prepared_json"), PreparedWrite.class), json.read(rs.getString("base_json"), CloudItem.class),
        rs.getString("error_code"), rs.getString("error_message"), rs.getInt("attempts"), rs.getObject("created_at", OffsetDateTime.class),
        rs.getObject("updated_at", OffsetDateTime.class), rs.getString("payload_path") == null ? null : new Payload(rs.getString("payload_path"), rs.getLong("payload_size"), rs.getString("payload_hash")), rs.getLong("operation_sequence")), args);
  }
  private OffsetDateTime now() { return OffsetDateTime.now(clock); }
}
