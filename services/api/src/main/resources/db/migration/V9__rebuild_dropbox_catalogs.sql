-- A Dropbox removal arrives with only a path, and it used to mark a single row at that path: when a file was
-- uploaded, removed and uploaded again with the same name, old copies stayed listed as live. The code now clears
-- every row at the path, but the copies already left behind need one full rescan to go away.
-- This does what CatalogStore.reset does: drop a half-built scan, then start a new one from no checkpoint. The
-- current scan keeps answering until the new one has caught up and takes its place.
DELETE i
FROM cloud_catalog_items i
JOIN cloud_catalog_state s ON s.connection_id = i.connection_id AND s.generation = i.generation
JOIN provider_connections c ON c.id = s.connection_id
WHERE c.provider = 'dropbox' AND s.building_scan <> s.active_scan AND i.scan_id = s.building_scan;

UPDATE s
-- Migrations run before the workers start, so a lease left by the previous process belongs to no one.
SET building_scan = s.building_scan + 1, [checkpoint] = NULL, next_run = SYSDATETIMEOFFSET(),
    lease_owner = NULL, lease_until = NULL
FROM cloud_catalog_state s
JOIN provider_connections c ON c.id = s.connection_id
WHERE c.provider = 'dropbox';
