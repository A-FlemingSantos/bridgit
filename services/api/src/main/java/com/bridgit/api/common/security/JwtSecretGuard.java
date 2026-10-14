package com.bridgit.api.common.security;

import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

/**
 * Refuses to start with a missing, short or development JWT secret. The development
 * secrets are versioned in the repository, so outside the test profile they would sign
 * sessions and content tickets with a public key.
 */
@Component
public class JwtSecretGuard {

  static final String DEVELOPMENT_PREFIX = "dev-only-";
  static final int MIN_BYTES = 32;

  public JwtSecretGuard(@Value("${app.jwt.secret:}") String secret, Environment environment) {
    check(secret, environment.acceptsProfiles(Profiles.of("test")));
  }

  static void check(String secret, boolean testProfile) {
    if (secret == null || secret.isBlank()) {
      throw new IllegalStateException("APP_JWT_SECRET não está definida. Gere uma chave com: openssl rand -base64 48");
    }
    if (secret.getBytes(StandardCharsets.UTF_8).length < MIN_BYTES) {
      throw new IllegalStateException("APP_JWT_SECRET precisa ter pelo menos " + MIN_BYTES + " bytes.");
    }
    if (!testProfile && secret.startsWith(DEVELOPMENT_PREFIX)) {
      throw new IllegalStateException("APP_JWT_SECRET usa uma chave de desenvolvimento versionada. Defina uma chave própria.");
    }
  }
}
