package com.bridgit.api.common.security;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class JwtSecretGuardTest {

  private static final String DEV_SECRET =
      "dev-only-local-jwt-secret-change-me-00000000000000000000000000000000";

  @Test
  void rejectsMissingSecret() {
    assertThrows(IllegalStateException.class, () -> JwtSecretGuard.check("", false));
    assertThrows(IllegalStateException.class, () -> JwtSecretGuard.check(null, true));
  }

  @Test
  void rejectsShortSecret() {
    assertThrows(IllegalStateException.class, () -> JwtSecretGuard.check("curta-demais", false));
  }

  @Test
  void rejectsDevelopmentSecretOutsideTests() {
    assertThrows(IllegalStateException.class, () -> JwtSecretGuard.check(DEV_SECRET, false));
    assertDoesNotThrow(() -> JwtSecretGuard.check(DEV_SECRET, true));
  }

  @Test
  void acceptsOwnSecret() {
    assertDoesNotThrow(() -> JwtSecretGuard.check("0123456789abcdef0123456789abcdef-chave-propria", false));
  }
}
