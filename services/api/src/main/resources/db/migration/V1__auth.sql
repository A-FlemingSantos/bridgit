CREATE TABLE users (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    created_at DATETIMEOFFSET NOT NULL,
    updated_at DATETIMEOFFSET NOT NULL,
    username NVARCHAR(32) NOT NULL,
    username_key NVARCHAR(32) NOT NULL UNIQUE,
    password_hash NVARCHAR(255) NOT NULL
);

CREATE TABLE user_sessions (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    created_at DATETIMEOFFSET NOT NULL,
    updated_at DATETIMEOFFSET NOT NULL,
    user_id UNIQUEIDENTIFIER NOT NULL,
    device_key UNIQUEIDENTIFIER NOT NULL,
    persistent BIT NOT NULL,
    user_agent NVARCHAR(1000) NULL,
    last_seen_at DATETIMEOFFSET NOT NULL,
    revoked_at DATETIMEOFFSET NULL,
    CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_user_sessions_user_revoked_last_seen
ON user_sessions (user_id, revoked_at, last_seen_at DESC, created_at DESC);

CREATE UNIQUE INDEX ux_user_sessions_user_device_active
ON user_sessions (user_id, device_key)
WHERE revoked_at IS NULL;
