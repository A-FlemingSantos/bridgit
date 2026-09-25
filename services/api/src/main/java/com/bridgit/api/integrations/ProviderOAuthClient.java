package com.bridgit.api.integrations;

import com.bridgit.api.providers.CloudProvider;

public interface ProviderOAuthClient {

  CloudProvider provider();

  String authorizationUrl(String state, String codeChallenge);

  TokenResult exchangeCode(String code, String codeVerifier);

  TokenResult refresh(String refreshToken);

  ProviderAccount fetchAccount(String accessToken);

  void revoke(String accessToken, String refreshToken);
}
