package com.bridgit.api.integrations;

import com.bridgit.api.providers.CloudProvider;
import java.util.Optional;

public interface ProviderOAuthClient {

  CloudProvider provider();

  String authorizationUrl(String state, String codeChallenge);

  /** {@code addAccount}: the user is adding another account, so the provider must let them pick one. */
  default String authorizationUrl(String state, String codeChallenge, boolean addAccount) {
    return authorizationUrl(state, codeChallenge);
  }

  TokenResult exchangeCode(String code, String codeVerifier);

  TokenResult refresh(String refreshToken);

  ProviderAccount fetchAccount(String accessToken);

  /** Profile photo of the account; empty when the account has none. */
  default Optional<AvatarImage> fetchAvatar(String accessToken) {
    return Optional.empty();
  }

  void revoke(String accessToken, String refreshToken);
}
