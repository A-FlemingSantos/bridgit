package com.bridgit.api.catalog;

import com.bridgit.api.common.error.ConflictException;
import com.bridgit.api.files.FilesDtos;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.ItemKind;
import com.bridgit.api.providers.sync.CloudChange;
import com.bridgit.api.providers.sync.SyncPage;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Durable confirmed state. SQL transactions never enclose a provider call. */
@Repository
public class CatalogStore {
  private final JdbcTemplate jdbc;
  private final HubJson json;
  private final HubEventStore events;
  private final Clock clock;
  private final TransactionTemplate tx;

  public CatalogStore(JdbcTemplate jdbc, HubJson json, HubEventStore events, Clock clock,
      PlatformTransactionManager transactions) {
    this.jdbc = jdbc; this.json = json; this.events = events; this.clock = clock;
    this.tx = new TransactionTemplate(transactions);
  }

  public record State(long generation, long activeScan, long buildingScan, long revision,
      boolean complete, String checkpoint, String rootRef, OffsetDateTime syncedAt,
      String leaseOwner, OffsetDateTime activeAt, OffsetDateTime watchExpires, int failures) {}
  public record Entry(CloudItem item, String path, String parentPath, boolean fenced, boolean deleted) {}
  public record FolderPage(List<CloudItem> items, boolean complete, State state) {}

  public State ensure(ProviderConnectionEntity connection) {
    return tx.execute(status -> ensureLocked(connection));
  }

  private State ensureLocked(ProviderConnectionEntity c) {
    List<Long> current = jdbc.query("SELECT generation FROM provider_connections WITH (UPDLOCK,ROWLOCK) WHERE id=?",
        (rs, row) -> rs.getLong(1), c.getId().toString());
    if (current.isEmpty() || current.getFirst() != c.getGeneration()) throw staleConnection();
    List<State> states = states(c.getId());
    if (states.isEmpty()) {
      jdbc.update("INSERT INTO cloud_catalog_state(connection_id,generation,next_run) VALUES(?,?,?)",
          c.getId().toString(), c.getGeneration(), now());
    } else if (states.getFirst().generation() != c.getGeneration()) {
      jdbc.update("DELETE FROM cloud_catalog_items WHERE connection_id=?", c.getId().toString());
      jdbc.update("DELETE FROM cloud_catalog_folders WHERE connection_id=?", c.getId().toString());
      jdbc.update("UPDATE cloud_catalog_state SET generation=?,active_scan=1,building_scan=1,revision=revision+1,complete=0,[checkpoint]=NULL,root_ref=NULL,synced_at=NULL,lease_owner=NULL,lease_until=NULL,watch_id=NULL,watch_expires=NULL,next_run=? WHERE connection_id=?",
          c.getGeneration(), now(), c.getId().toString());
    }
    return states(c.getId()).getFirst();
  }

  public State state(UUID connection) { return states(connection).stream().findFirst().orElse(null); }
  public List<UUID> dueConnections() {
    return jdbc.query("SELECT TOP (64) c.id FROM provider_connections c LEFT JOIN cloud_catalog_state s ON s.connection_id=c.id WHERE s.connection_id IS NULL OR s.generation<>c.generation OR (s.next_run<=? AND (s.lease_until IS NULL OR s.lease_until<?)) ORDER BY COALESCE(s.next_run,c.connected_at)",
        (rs, row) -> UUID.fromString(rs.getString(1)), now(), now());
  }
  private List<State> states(UUID id) {
    return jdbc.query("SELECT * FROM cloud_catalog_state WHERE connection_id=?", (rs, row) -> new State(
        rs.getLong("generation"), rs.getLong("active_scan"), rs.getLong("building_scan"), rs.getLong("revision"),
        rs.getBoolean("complete"), rs.getString("checkpoint"), rs.getString("root_ref"),
        rs.getObject("synced_at", OffsetDateTime.class), rs.getString("lease_owner"),
        rs.getObject("active_at", OffsetDateTime.class), rs.getObject("watch_expires", OffsetDateTime.class), rs.getInt("failures")), id.toString());
  }

  public void touch(ProviderConnectionEntity c) {
    ensure(c);
    jdbc.update("UPDATE cloud_catalog_state SET active_at=? WHERE connection_id=? AND generation=?", now(), c.getId().toString(), c.getGeneration());
  }

  public void schedule(UUID connection) {
    jdbc.update("UPDATE cloud_catalog_state SET next_run=? WHERE connection_id=?", now(), connection.toString());
  }

  public boolean claim(ProviderConnectionEntity c, String owner) {
    ensure(c);
    return jdbc.update("UPDATE cloud_catalog_state SET lease_owner=?,lease_until=? WHERE connection_id=? AND generation=? AND next_run<=? AND (lease_until IS NULL OR lease_until<?)",
        owner, now().plusMinutes(3), c.getId().toString(), c.getGeneration(), now(), now()) == 1;
  }

  public void release(ProviderConnectionEntity c, String owner, long delaySeconds, String error) {
    jdbc.update("UPDATE cloud_catalog_state SET lease_owner=NULL,lease_until=NULL,next_run=?,last_error=?,failures=CASE WHEN ? IS NULL THEN 0 ELSE failures+1 END WHERE connection_id=? AND generation=? AND lease_owner=?",
        now().plusSeconds(delaySeconds), error, error, c.getId().toString(), c.getGeneration(), owner);
  }

  public Entry entry(ProviderConnectionEntity c, String ref) {
    State state = ensure(c);
    return entry(c, state.activeScan(), ref);
  }
  public Entry entryByPath(ProviderConnectionEntity c, String path) {
    State state = ensure(c);
    String ref = jdbc.query("SELECT item_ref FROM cloud_catalog_items WHERE connection_id=? AND generation=? AND scan_id=? AND path_hash=?",
        (rs, row) -> rs.getString(1), c.getId().toString(), c.getGeneration(), state.activeScan(), pathHash(path)).stream().findFirst().orElse(null);
    return ref == null ? null : entry(c, state.activeScan(), ref);
  }

  private Entry entry(ProviderConnectionEntity c, long scan, String ref) {
    if (ref == null) return null;
    return jdbc.query("SELECT item_json,remote_path,parent_path,mutation_fence,deleted FROM cloud_catalog_items WHERE connection_id=? AND generation=? AND scan_id=? AND item_ref=?",
        (rs, row) -> new Entry(json.read(rs.getString(1), CloudItem.class), rs.getString(2), rs.getString(3), rs.getBoolean(4), rs.getBoolean(5)),
        c.getId().toString(), c.getGeneration(), scan, ref).stream().findFirst().orElse(null);
  }

  public FolderPage folder(ProviderConnectionEntity c, String parent) {
    return folder(c, parent, 0, Integer.MAX_VALUE);
  }

  public FolderPage folder(ProviderConnectionEntity c, String parent, int offset, int limit) {
    State s = ensure(c);
    List<Object> arguments = new ArrayList<>(List.of(c.getId().toString(), c.getGeneration(), s.activeScan()));
    if (parent != null) arguments.add(parent);
    arguments.add(offset); arguments.add(limit);
    List<CloudItem> items = jdbc.query("SELECT item_json FROM cloud_catalog_items WHERE connection_id=? AND generation=? AND scan_id=? AND deleted=0 AND "
        + (parent == null ? "parent_ref IS NULL AND JSON_VALUE(item_json,'$.parentKnown')='true'" : "parent_ref=?") + " ORDER BY CASE WHEN kind='folder' THEN 0 ELSE 1 END,item_name,item_ref OFFSET ? ROWS FETCH NEXT ? ROWS ONLY",
        (rs, row) -> json.read(rs.getString(1), CloudItem.class),
        arguments.toArray());
    boolean complete = s.complete() || Boolean.TRUE.equals(jdbc.query("SELECT complete FROM cloud_catalog_folders WHERE connection_id=? AND generation=? AND scan_id=? AND parent_key=?",
        (rs, row) -> rs.getBoolean(1), c.getId().toString(), c.getGeneration(), s.activeScan(), parentKey(parent)).stream().findFirst().orElse(false));
    return new FolderPage(items, complete, s);
  }

  public List<FilesDtos.FolderRef> ancestry(ProviderConnectionEntity c, CloudItem item) {
    List<FilesDtos.FolderRef> chain = new ArrayList<>();
    Set<String> seen = new HashSet<>();
    String ref = item.parentRef();
    while (ref != null && seen.add(ref) && chain.size() < 512) {
      Entry parent = entry(c, ref);
      if (parent == null || parent.deleted()) break;
      chain.add(new FilesDtos.FolderRef(ref, parent.item().name()));
      ref = parent.item().parentRef();
    }
    Collections.reverse(chain);
    return chain;
  }

  public void remember(ProviderConnectionEntity c, List<CloudItem> items, String parent, boolean complete) {
    tx.executeWithoutResult(status -> {
      State s = ensureLocked(c);
      for (CloudItem item : items) upsert(c, s.activeScan(), CloudChange.upsert(item), false);
      jdbc.update("DELETE FROM cloud_catalog_folders WHERE connection_id=? AND generation=? AND scan_id=? AND parent_key=?",
          c.getId().toString(), c.getGeneration(), s.activeScan(), parentKey(parent));
      jdbc.update("INSERT INTO cloud_catalog_folders(connection_id,generation,scan_id,parent_key,complete) VALUES(?,?,?,?,?)",
          c.getId().toString(), c.getGeneration(), s.activeScan(), parentKey(parent), complete);
      advance(c, "catalog", Map.of("parentRef", parentKey(parent)));
    });
  }

  public void rememberItem(ProviderConnectionEntity c, CloudItem item) {
    tx.executeWithoutResult(status -> {
      State s = ensureLocked(c);
      upsert(c, s.activeScan(), CloudChange.upsert(item), false);
    });
  }

  /** Must join the operation-result transaction so success and projection cannot diverge. */
  public void confirmed(ProviderConnectionEntity c, CloudItem item, String deletedRef) {
    tx.executeWithoutResult(status -> {
      State s = ensureLocked(c);
      CloudChange change = deletedRef == null ? CloudChange.upsert(item) : CloudChange.removed(deletedRef);
      apply(c, s.activeScan(), change, true);
      if (s.buildingScan() != s.activeScan()) apply(c, s.buildingScan(), change, true);
      updateSnapshots(c, change);
      advance(c, "catalog", Map.of("ref", deletedRef == null ? item.ref() : deletedRef));
    });
  }

  public void applyPage(ProviderConnectionEntity c, String owner, State captured, SyncPage page) {
    tx.executeWithoutResult(status -> {
      State s = ensureLocked(c);
      if (!Objects.equals(s.leaseOwner(), owner) || s.buildingScan() != captured.buildingScan()
          || !Objects.equals(s.checkpoint(), captured.checkpoint())) throw staleConnection();
      for (CloudChange change : page.changes()) apply(c, s.buildingScan(), change, false);
      resolvePaths(c, s.buildingScan());
      if (page.caughtUp()) {
        removeDeletedDescendants(c, s.buildingScan());
        jdbc.update("UPDATE cloud_catalog_state SET active_scan=building_scan,complete=1,synced_at=?,[checkpoint]=?,root_ref=COALESCE(?,root_ref) WHERE connection_id=? AND generation=?",
            now(), page.checkpoint(), page.rootRef(), c.getId().toString(), c.getGeneration());
        jdbc.update("DELETE FROM cloud_catalog_items WHERE connection_id=? AND (generation<>? OR scan_id<>?)", c.getId().toString(), c.getGeneration(), s.buildingScan());
        jdbc.update("DELETE FROM cloud_catalog_folders WHERE connection_id=? AND (generation<>? OR scan_id<>?)", c.getId().toString(), c.getGeneration(), s.buildingScan());
        reconcileSnapshots(c, s.buildingScan());
      } else {
        jdbc.update("UPDATE cloud_catalog_state SET [checkpoint]=?,root_ref=COALESCE(?,root_ref) WHERE connection_id=? AND generation=?",
            page.checkpoint(), page.rootRef(), c.getId().toString(), c.getGeneration());
      }
      if ((page.caughtUp() || s.activeScan() == s.buildingScan())
          && (!page.changes().isEmpty() || !s.complete() || s.activeScan() != s.buildingScan())) advance(c, "catalog", Map.of("refresh", true));
    });
  }

  public void reset(ProviderConnectionEntity c, String owner) {
    tx.executeWithoutResult(status -> {
      State s = ensureLocked(c);
      if (!Objects.equals(owner, s.leaseOwner())) return;
      if (s.buildingScan() != s.activeScan()) {
        jdbc.update("DELETE FROM cloud_catalog_items WHERE connection_id=? AND generation=? AND scan_id=?", c.getId().toString(), c.getGeneration(), s.buildingScan());
      }
      jdbc.update("UPDATE cloud_catalog_state SET building_scan=building_scan+1,[checkpoint]=NULL WHERE connection_id=? AND generation=?", c.getId().toString(), c.getGeneration());
    });
  }

  private void apply(ProviderConnectionEntity c, long scan, CloudChange change, boolean fence) {
    if (!change.deleted()) { upsert(c, scan, change, fence); return; }
    String ref = change.ref();
    if (ref == null && change.path() != null) {
      ref = jdbc.query("SELECT item_ref FROM cloud_catalog_items WHERE connection_id=? AND generation=? AND scan_id=? AND path_hash=?",
          (rs, row) -> rs.getString(1), c.getId().toString(), c.getGeneration(), scan, pathHash(change.path())).stream().findFirst().orElse(null);
    }
    if (ref == null) return;
    jdbc.update("UPDATE cloud_catalog_items SET deleted=1,mutation_fence=? WHERE connection_id=? AND generation=? AND scan_id=? AND item_ref=?",
        fence, c.getId().toString(), c.getGeneration(), scan, ref);
    if (fence) removeDescendants(c, scan, List.of(ref));
  }

  private void removeDeletedDescendants(ProviderConnectionEntity c, long scan) {
    List<String> removed = jdbc.query("SELECT item_ref FROM cloud_catalog_items WHERE connection_id=? AND generation=? AND scan_id=? AND deleted=1 AND kind='folder'",
        (rs, row) -> rs.getString(1), c.getId().toString(), c.getGeneration(), scan);
    removeDescendants(c, scan, removed);
  }

  private void removeDescendants(ProviderConnectionEntity c, long scan, List<String> removed) {
    // Resolve moves across every delta page before cascading a remote folder deletion.
    Deque<String> pending = new ArrayDeque<>(removed);
    Set<String> seen = new HashSet<>();
    while (!pending.isEmpty()) {
      String parent = pending.removeFirst();
      if (!seen.add(parent)) continue;
      List<String> children = jdbc.query("SELECT item_ref FROM cloud_catalog_items WHERE connection_id=? AND generation=? AND scan_id=? AND parent_ref=? AND deleted=0",
          (rs, row) -> rs.getString(1), c.getId().toString(), c.getGeneration(), scan, parent);
      pending.addAll(children);
      jdbc.update("UPDATE cloud_catalog_items SET deleted=1 WHERE connection_id=? AND generation=? AND scan_id=? AND parent_ref=?", c.getId().toString(), c.getGeneration(), scan, parent);
    }
  }

  private void upsert(ProviderConnectionEntity c, long scan, CloudChange change, boolean fence) {
    if (change.item() == null || change.item().ref() == null) return;
    Entry previous = entry(c, scan, change.item().ref());
    CloudItem item = merge(previous == null ? null : previous.item(), change);
    String path = change.path() != null ? change.path() : previous == null ? null : previous.path();
    String parentPath = change.parentPath() != null ? change.parentPath() : previous == null ? null : previous.parentPath();
    if ("dropbox".equals(c.getProvider()) && change.parentPath() != null
        && (previous == null || !Objects.equals(previous.parentPath(), change.parentPath()))) {
      boolean root = change.parentPath().isEmpty() || "/".equals(change.parentPath());
      item = new CloudItem(item.ref(), item.provider(), item.name(), item.kind(), item.mimeType(), item.extension(), item.size(),
          item.modifiedAt(), null, root, item.remoteVersion(), item.contentRevision());
    }
    if (previous != null && item.kind() == ItemKind.FOLDER && previous.path() != null && path != null && !previous.path().equals(path)) {
      relocateDescendantPaths(c, scan, previous.path(), path);
    }
    if (previous == null) {
      jdbc.update("INSERT INTO cloud_catalog_items(connection_id,generation,scan_id,item_ref,parent_ref,item_name,kind,item_json,remote_path,path_hash,parent_path,mutation_fence,deleted) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0)",
          c.getId().toString(), c.getGeneration(), scan, item.ref(), item.parentRef(), safeName(item), item.kind().name().toLowerCase(Locale.ROOT), json.write(item), path, pathHash(path), parentPath, fence);
    } else {
      jdbc.update("UPDATE cloud_catalog_items SET parent_ref=?,item_name=?,kind=?,item_json=?,remote_path=?,path_hash=?,parent_path=?,mutation_fence=?,deleted=0 WHERE connection_id=? AND generation=? AND scan_id=? AND item_ref=?",
          item.parentRef(), safeName(item), item.kind().name().toLowerCase(Locale.ROOT), json.write(item), path, pathHash(path), parentPath,
          fence || previous.fenced(), c.getId().toString(), c.getGeneration(), scan, item.ref());
    }
  }

  private void relocateDescendantPaths(ProviderConnectionEntity c, long scan, String oldPath, String newPath) {
    String prefix = oldPath + "/";
    List<Map<String, Object>> descendants = jdbc.queryForList("SELECT item_ref,remote_path,parent_path FROM cloud_catalog_items WHERE connection_id=? AND generation=? AND scan_id=? AND LEFT(remote_path,?)=?",
        c.getId().toString(), c.getGeneration(), scan, prefix.length(), prefix);
    for (Map<String, Object> row : descendants) {
      String path = newPath + row.get("remote_path").toString().substring(oldPath.length());
      String parent = Objects.toString(row.get("parent_path"), null);
      if (parent != null && (parent.equalsIgnoreCase(oldPath) || parent.toLowerCase(Locale.ROOT).startsWith(prefix.toLowerCase(Locale.ROOT)))) parent = newPath + parent.substring(oldPath.length());
      jdbc.update("UPDATE cloud_catalog_items SET remote_path=?,path_hash=?,parent_path=? WHERE connection_id=? AND generation=? AND scan_id=? AND item_ref=?",
          path, pathHash(path), parent, c.getId().toString(), c.getGeneration(), scan, row.get("item_ref"));
    }
  }

  static CloudItem merge(CloudItem old, CloudChange change) {
    CloudItem n = change.item();
    if (old == null) return n;
    Set<String> fields = change.knownFields();
    boolean parent = fields.contains("parentRef") && n.parentKnown();
    return new CloudItem(n.ref(), n.provider(), fields.contains("name") ? n.name() : old.name(),
        fields.contains("kind") ? n.kind() : old.kind(), fields.contains("mimeType") ? n.mimeType() : old.mimeType(),
        fields.contains("extension") ? n.extension() : old.extension(), fields.contains("size") ? n.size() : old.size(),
        fields.contains("modifiedAt") ? n.modifiedAt() : old.modifiedAt(), parent ? n.parentRef() : old.parentRef(),
        parent || old.parentKnown(), fields.contains("remoteVersion") ? n.remoteVersion() : old.remoteVersion(),
        fields.contains("contentRevision") ? n.contentRevision() : old.contentRevision());
  }

  private void resolvePaths(ProviderConnectionEntity c, long scan) {
    List<Entry> unresolved = jdbc.query("SELECT item_json,remote_path,parent_path,mutation_fence,deleted FROM cloud_catalog_items WHERE connection_id=? AND generation=? AND scan_id=? AND parent_path IS NOT NULL AND deleted=0 AND (JSON_VALUE(item_json,'$.parentKnown')<>'true' OR JSON_VALUE(item_json,'$.parentKnown') IS NULL)",
        (rs, row) -> new Entry(json.read(rs.getString(1), CloudItem.class), rs.getString(2), rs.getString(3), rs.getBoolean(4), rs.getBoolean(5)), c.getId().toString(), c.getGeneration(), scan);
    for (Entry e : unresolved) {
      String parent = e.parentPath().isEmpty() || e.parentPath().equals("/") ? null : jdbc.query(
          "SELECT item_ref FROM cloud_catalog_items WHERE connection_id=? AND generation=? AND scan_id=? AND path_hash=? AND deleted=0",
          (rs, row) -> rs.getString(1), c.getId().toString(), c.getGeneration(), scan, pathHash(e.parentPath())).stream().findFirst().orElse(null);
      boolean known = parent != null || e.parentPath().isEmpty() || e.parentPath().equals("/");
      CloudItem n = e.item();
      if (known && (!n.parentKnown() || !Objects.equals(parent, n.parentRef()))) {
        CloudItem resolved = new CloudItem(n.ref(), n.provider(), n.name(), n.kind(), n.mimeType(), n.extension(), n.size(), n.modifiedAt(), parent, true, n.remoteVersion(), n.contentRevision());
        jdbc.update("UPDATE cloud_catalog_items SET parent_ref=?,item_json=? WHERE connection_id=? AND generation=? AND scan_id=? AND item_ref=?",
            parent, json.write(resolved), c.getId().toString(), c.getGeneration(), scan, n.ref());
      }
    }
  }

  private void reconcileSnapshots(ProviderConnectionEntity c, long scan) {
    List<Entry> changed = jdbc.query("SELECT item_json,deleted FROM cloud_catalog_items WHERE connection_id=? AND generation=? AND scan_id=? AND item_ref IN (SELECT item_ref COLLATE Latin1_General_100_BIN2 FROM hub_recents WHERE connection_id=? UNION SELECT item_ref COLLATE Latin1_General_100_BIN2 FROM hub_shortcuts WHERE connection_id=? UNION SELECT item_ref COLLATE Latin1_General_100_BIN2 FROM public_links WHERE connection_id=?)",
        (rs, row) -> new Entry(json.read(rs.getString(1), CloudItem.class), null, null, false, rs.getBoolean(2)),
        c.getId().toString(), c.getGeneration(), scan, c.getId().toString(), c.getId().toString(), c.getId().toString());
    for (Entry entry : changed) updateSnapshots(c, entry.deleted() ? CloudChange.removed(entry.item().ref()) : CloudChange.upsert(entry.item()));
    for (String table : List.of("hub_recents", "hub_shortcuts", "public_links")) {
      jdbc.update("DELETE snapshot FROM " + table + " snapshot WHERE snapshot.connection_id=? AND NOT EXISTS (SELECT 1 FROM cloud_catalog_items item WHERE item.connection_id=snapshot.connection_id AND item.generation=? AND item.scan_id=? AND item.item_ref=snapshot.item_ref COLLATE Latin1_General_100_BIN2 AND item.deleted=0)",
          c.getId().toString(), c.getGeneration(), scan);
    }
  }

  private void updateSnapshots(ProviderConnectionEntity c, CloudChange change) {
    for (String table : List.of("hub_recents", "hub_shortcuts", "public_links")) {
      if (change.deleted()) jdbc.update("DELETE FROM " + table + " WHERE connection_id=? AND item_ref=?", c.getId().toString(), change.ref());
      else {
        jdbc.update("UPDATE " + table + " SET name=?,mime_type=?,extension=?,updated_at=? WHERE connection_id=? AND item_ref COLLATE Latin1_General_100_BIN2=?",
            safeName(change.item()), change.item().mimeType(), change.item().extension(), now(), c.getId().toString(), change.ref());
        if (table.equals("public_links")) jdbc.update("UPDATE public_links SET size=? WHERE connection_id=? AND item_ref COLLATE Latin1_General_100_BIN2=?", change.item().size(), c.getId().toString(), change.ref());
      }
    }
  }

  private void advance(ProviderConnectionEntity c, String event, Object payload) {
    jdbc.update("UPDATE cloud_catalog_state SET revision=revision+1 WHERE connection_id=? AND generation=?", c.getId().toString(), c.getGeneration());
    events.append(c.getUserId(), c.getId(), c.getGeneration(), event, payload);
  }
  public FilesDtos.CatalogMetadata metadata(ProviderConnectionEntity c, State state, boolean complete) {
    return new FilesDtos.CatalogMetadata(c.getId(), c.getGeneration(), state.revision(), complete ? "complete" : "partial", state.syncedAt());
  }
  private OffsetDateTime now() { return OffsetDateTime.now(clock); }
  private static String safeName(CloudItem item) { return item.name() == null ? item.ref() : item.name(); }
  private static String parentKey(String parent) { return parent == null ? "" : parent; }
  private static String pathHash(String path) { return path == null ? null : HubJson.hash(path.toLowerCase(Locale.ROOT)); }
  private static ConflictException staleConnection() { return new ConflictException("CONEXAO_ALTERADA", "A conexao foi alterada. Atualize e tente novamente."); }
}
