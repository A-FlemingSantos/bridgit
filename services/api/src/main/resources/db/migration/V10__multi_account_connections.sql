-- A user may connect several accounts of the same provider; the same remote account only once.
ALTER TABLE provider_connections DROP CONSTRAINT ux_provider_connections_user_provider;

ALTER TABLE provider_connections ADD CONSTRAINT ux_provider_connections_user_provider_account
    UNIQUE (user_id, provider, account_id);
