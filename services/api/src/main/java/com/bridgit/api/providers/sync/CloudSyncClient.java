package com.bridgit.api.providers.sync;

import com.bridgit.api.providers.CloudProvider;

public interface CloudSyncClient {
  CloudProvider provider();
  /** Null checkpoint starts a complete inventory; one call fetches one bounded page. */
  SyncPage syncPage(String accessToken, String checkpoint);
}
