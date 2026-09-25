package com.bridgit.api.integrations;

public record TokenResult(
    String accessToken,
    String refreshToken,
    long expiresInSeconds,
    String scope
) {
}
