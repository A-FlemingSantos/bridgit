-- Connecting another account now adds it instead of replacing the connected one, so the flag is unused.
ALTER TABLE provider_oauth_states DROP CONSTRAINT df_provider_oauth_states_allow_account_change;

ALTER TABLE provider_oauth_states DROP COLUMN allow_account_change;
