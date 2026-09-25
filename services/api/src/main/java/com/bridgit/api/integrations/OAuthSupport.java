package com.bridgit.api.integrations;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;

final class OAuthSupport {

  private static final SecureRandom SECURE_RANDOM = new SecureRandom();

  private OAuthSupport() {
  }

  static String randomBase64Url(int byteLength) {
    byte[] bytes = new byte[byteLength];
    SECURE_RANDOM.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  static String pkceChallengeS256(String codeVerifier) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] hash = digest.digest(codeVerifier.getBytes(StandardCharsets.US_ASCII));
      return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
    } catch (NoSuchAlgorithmException ex) {
      throw new IllegalStateException("SHA-256 indisponivel.", ex);
    }
  }

  static String generateCodeVerifier() {
    return randomBase64Url(32);
  }
}
