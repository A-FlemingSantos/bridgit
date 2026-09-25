CREATE TABLE provider_connections (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    created_at DATETIMEOFFSET NOT NULL,
    updated_at DATETIMEOFFSET NOT NULL,
    user_id UNIQUEIDENTIFIER NOT NULL,
    provider NVARCHAR(20) NOT NULL,
    account_id NVARCHAR(200) NOT NULL,
    account_email NVARCHAR(320) NULL,
    account_name NVARCHAR(200) NULL,
    scopes NVARCHAR(1000) NULL,
    encrypted_refresh_token NVARCHAR(4000) NOT NULL,
    connected_at DATETIMEOFFSET NOT NULL,
    last_error NVARCHAR(120) NULL,
    CONSTRAINT fk_provider_connections_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT ux_provider_connections_user_provider UNIQUE (user_id, provider)
);

CREATE TABLE provider_oauth_states (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    created_at DATETIMEOFFSET NOT NULL,
    updated_at DATETIMEOFFSET NOT NULL,
    user_id UNIQUEIDENTIFIER NOT NULL,
    provider NVARCHAR(20) NOT NULL,
    state_token NVARCHAR(120) NOT NULL UNIQUE,
    code_verifier NVARCHAR(200) NOT NULL,
    redirect_path NVARCHAR(500) NULL,
    expires_at DATETIMEOFFSET NOT NULL,
    used_at DATETIMEOFFSET NULL,
    CONSTRAINT fk_provider_oauth_states_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_provider_oauth_states_user_id ON provider_oauth_states (user_id);

CREATE TABLE hub_recents (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    created_at DATETIMEOFFSET NOT NULL,
    updated_at DATETIMEOFFSET NOT NULL,
    user_id UNIQUEIDENTIFIER NOT NULL,
    connection_id UNIQUEIDENTIFIER NOT NULL,
    item_ref NVARCHAR(400) NOT NULL,
    name NVARCHAR(400) NOT NULL,
    mime_type NVARCHAR(200) NULL,
    extension NVARCHAR(40) NULL,
    opened_at DATETIMEOFFSET NOT NULL,
    CONSTRAINT fk_hub_recents_connection FOREIGN KEY (connection_id) REFERENCES provider_connections (id) ON DELETE CASCADE,
    CONSTRAINT ux_hub_recents_connection_item_ref UNIQUE (connection_id, item_ref)
);

CREATE INDEX idx_hub_recents_user_opened_at ON hub_recents (user_id, opened_at DESC);

CREATE TABLE hub_shortcuts (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    created_at DATETIMEOFFSET NOT NULL,
    updated_at DATETIMEOFFSET NOT NULL,
    user_id UNIQUEIDENTIFIER NOT NULL,
    connection_id UNIQUEIDENTIFIER NOT NULL,
    item_ref NVARCHAR(400) NOT NULL,
    name NVARCHAR(400) NOT NULL,
    mime_type NVARCHAR(200) NULL,
    extension NVARCHAR(40) NULL,
    pinned_at DATETIMEOFFSET NOT NULL,
    CONSTRAINT fk_hub_shortcuts_connection FOREIGN KEY (connection_id) REFERENCES provider_connections (id) ON DELETE CASCADE,
    CONSTRAINT ux_hub_shortcuts_connection_item_ref UNIQUE (connection_id, item_ref)
);

CREATE INDEX idx_hub_shortcuts_user_pinned_at ON hub_shortcuts (user_id, pinned_at DESC);

CREATE TABLE public_links (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    created_at DATETIMEOFFSET NOT NULL,
    updated_at DATETIMEOFFSET NOT NULL,
    user_id UNIQUEIDENTIFIER NOT NULL,
    connection_id UNIQUEIDENTIFIER NOT NULL,
    item_ref NVARCHAR(400) NOT NULL,
    suffix NVARCHAR(32) NOT NULL UNIQUE,
    slug NVARCHAR(120) NOT NULL,
    name NVARCHAR(400) NOT NULL,
    mime_type NVARCHAR(200) NULL,
    extension NVARCHAR(40) NULL,
    size BIGINT NULL,
    last_accessed_at DATETIMEOFFSET NULL,
    CONSTRAINT fk_public_links_connection FOREIGN KEY (connection_id) REFERENCES provider_connections (id) ON DELETE CASCADE,
    CONSTRAINT ux_public_links_connection_item_ref UNIQUE (connection_id, item_ref)
);
