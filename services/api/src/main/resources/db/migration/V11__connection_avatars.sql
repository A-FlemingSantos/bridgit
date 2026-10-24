-- Profile photo of each connected account, fetched lazily from the provider and served by the API.
-- generation ties the photo to the connection generation it was fetched for (a reconnect bumps it).
CREATE TABLE provider_connection_avatars (
    connection_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    generation BIGINT NOT NULL,
    status VARCHAR(10) NOT NULL,
    content_type VARCHAR(50) NULL,
    bytes VARBINARY(MAX) NULL,
    etag VARCHAR(64) NULL,
    fetched_at DATETIMEOFFSET NOT NULL,
    CONSTRAINT fk_provider_connection_avatars_connection FOREIGN KEY (connection_id)
        REFERENCES provider_connections (id) ON DELETE CASCADE,
    CONSTRAINT ck_provider_connection_avatars_status CHECK (status IN ('ok', 'none'))
);
