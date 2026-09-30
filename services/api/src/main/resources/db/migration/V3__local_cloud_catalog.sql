ALTER TABLE provider_connections ADD generation BIGINT NOT NULL CONSTRAINT df_connection_generation DEFAULT 1;

CREATE TABLE cloud_catalog_state (
 connection_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
 generation BIGINT NOT NULL,
 active_scan BIGINT NOT NULL DEFAULT 1,
 building_scan BIGINT NOT NULL DEFAULT 1,
 revision BIGINT NOT NULL DEFAULT 0,
 complete BIT NOT NULL DEFAULT 0,
 [checkpoint] NVARCHAR(MAX) NULL,
 root_ref NVARCHAR(400) NULL,
 synced_at DATETIMEOFFSET NULL,
 active_at DATETIMEOFFSET NULL,
 next_run DATETIMEOFFSET NOT NULL,
 lease_owner NVARCHAR(80) NULL,
 lease_until DATETIMEOFFSET NULL,
 failures INT NOT NULL DEFAULT 0,
 last_error NVARCHAR(240) NULL,
 watch_id NVARCHAR(400) NULL,
 watch_resource NVARCHAR(1000) NULL,
 watch_secret NVARCHAR(100) NULL,
 watch_expires DATETIMEOFFSET NULL,
 CONSTRAINT fk_catalog_state_connection FOREIGN KEY(connection_id) REFERENCES provider_connections(id) ON DELETE CASCADE
);

CREATE TABLE cloud_catalog_items (
 connection_id UNIQUEIDENTIFIER NOT NULL,
 generation BIGINT NOT NULL,
 scan_id BIGINT NOT NULL,
 item_ref NVARCHAR(400) COLLATE Latin1_General_100_BIN2 NOT NULL,
 parent_ref NVARCHAR(400) COLLATE Latin1_General_100_BIN2 NULL,
 item_name NVARCHAR(400) NOT NULL,
 kind NVARCHAR(16) NOT NULL,
 item_json NVARCHAR(MAX) NOT NULL,
 remote_path NVARCHAR(2000) NULL,
 path_hash VARCHAR(64) NULL,
 parent_path NVARCHAR(2000) NULL,
 mutation_fence BIT NOT NULL DEFAULT 0,
 deleted BIT NOT NULL DEFAULT 0,
 PRIMARY KEY(connection_id, generation, scan_id, item_ref),
 CONSTRAINT fk_catalog_item_connection FOREIGN KEY(connection_id) REFERENCES provider_connections(id) ON DELETE CASCADE
);
CREATE INDEX ix_catalog_parent ON cloud_catalog_items(connection_id,generation,scan_id,parent_ref) INCLUDE(deleted,kind,item_name);
CREATE INDEX ix_catalog_path ON cloud_catalog_items(connection_id,generation,scan_id,path_hash);

CREATE TABLE cloud_catalog_folders (
 connection_id UNIQUEIDENTIFIER NOT NULL,
 generation BIGINT NOT NULL,
 scan_id BIGINT NOT NULL,
 parent_key NVARCHAR(400) COLLATE Latin1_General_100_BIN2 NOT NULL,
 complete BIT NOT NULL DEFAULT 0,
 PRIMARY KEY(connection_id,generation,scan_id,parent_key),
 CONSTRAINT fk_catalog_folder_connection FOREIGN KEY(connection_id) REFERENCES provider_connections(id) ON DELETE CASCADE
);

CREATE TABLE cloud_operations (
 operation_sequence BIGINT IDENTITY(1,1) NOT NULL,
 id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
 user_id UNIQUEIDENTIFIER NOT NULL,
 connection_id UNIQUEIDENTIFIER NOT NULL,
 generation BIGINT NOT NULL,
 provider NVARCHAR(20) NOT NULL,
 client_key NVARCHAR(100) NOT NULL,
 request_hash VARCHAR(64) NOT NULL,
 request_json NVARCHAR(MAX) NOT NULL,
 kind NVARCHAR(20) NOT NULL,
 status NVARCHAR(24) NOT NULL,
 result_json NVARCHAR(MAX) NULL,
 prepared_json NVARCHAR(MAX) NULL,
 base_json NVARCHAR(MAX) NULL,
 error_code NVARCHAR(120) NULL,
 error_message NVARCHAR(1000) NULL,
 attempts INT NOT NULL DEFAULT 0,
 created_at DATETIMEOFFSET NOT NULL,
 updated_at DATETIMEOFFSET NOT NULL,
 next_run DATETIMEOFFSET NOT NULL,
 lease_owner NVARCHAR(80) NULL,
 lease_until DATETIMEOFFSET NULL,
 payload_path NVARCHAR(500) NULL,
 payload_size BIGINT NULL,
 payload_hash VARCHAR(64) NULL,
 CONSTRAINT ux_operation_idempotency UNIQUE(user_id,client_key)
);
CREATE INDEX ix_operations_due ON cloud_operations(status,next_run) INCLUDE(connection_id,created_at);
CREATE INDEX ix_operations_user ON cloud_operations(user_id,created_at);

CREATE TABLE cloud_events (
 sequence BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
 user_id UNIQUEIDENTIFIER NOT NULL,
 connection_id UNIQUEIDENTIFIER NOT NULL,
 generation BIGINT NOT NULL,
 event_type NVARCHAR(40) NOT NULL,
 payload NVARCHAR(MAX) NOT NULL,
 created_at DATETIMEOFFSET NOT NULL
);
CREATE INDEX ix_cloud_events_user ON cloud_events(user_id,sequence);
