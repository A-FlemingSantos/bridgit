package com.bridgit.api.providers.sync;

public interface CloudWatchClient {
  WatchRegistration watch(String accessToken, String callbackUrl, String clientState,
      WatchRegistration previous);
}
