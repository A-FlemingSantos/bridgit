ALTER TABLE provider_oauth_states ADD allow_account_change BIT NOT NULL
    CONSTRAINT df_provider_oauth_states_allow_account_change DEFAULT 0;
