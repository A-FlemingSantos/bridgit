-- Support the periodic retention job (RetentionService): each DELETE scans by date, and the existing
-- indexes all start with user_id or sequence.
CREATE INDEX ix_cloud_events_created_at ON cloud_events (created_at);
CREATE INDEX ix_provider_oauth_states_expires_at ON provider_oauth_states (expires_at);
CREATE INDEX ix_user_sessions_revoked_at ON user_sessions (revoked_at) WHERE revoked_at IS NOT NULL;
GO
