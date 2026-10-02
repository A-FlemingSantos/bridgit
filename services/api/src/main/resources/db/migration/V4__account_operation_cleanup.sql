-- Retain filesystem cleanup work across crashes and account deletion.
CREATE TABLE upload_cleanup_queue (
 payload_path NVARCHAR(500) NOT NULL,
 CONSTRAINT pk_upload_cleanup_queue PRIMARY KEY NONCLUSTERED(payload_path)
);

INSERT INTO upload_cleanup_queue(payload_path)
SELECT DISTINCT payload_path FROM cloud_operations o
WHERE payload_path IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id=o.user_id);
DELETE FROM cloud_operations WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id=cloud_operations.user_id);
DELETE FROM cloud_events WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id=cloud_events.user_id);

-- Only user FKs: adding connection cascades too would create multiple SQL Server cascade paths.
ALTER TABLE cloud_operations ADD CONSTRAINT fk_operations_user
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE cloud_events ADD CONSTRAINT fk_events_user
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE;
