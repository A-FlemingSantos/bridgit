ALTER TABLE user_sessions ADD client_kind NVARCHAR(10) NOT NULL
    CONSTRAINT df_user_sessions_client_kind DEFAULT 'WEB';

ALTER TABLE user_sessions ADD window_started_at DATETIMEOFFSET NOT NULL
    CONSTRAINT df_user_sessions_window_started_at DEFAULT SYSDATETIMEOFFSET();
GO

UPDATE user_sessions SET window_started_at = created_at;
