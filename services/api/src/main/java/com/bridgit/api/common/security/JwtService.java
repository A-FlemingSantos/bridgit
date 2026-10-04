package com.bridgit.api.common.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class JwtService {

  private final SecretKey secretKey;
  private final String issuer;
  private final Clock clock;

  public JwtService(
      @Value("${app.jwt.secret}") String secret,
      @Value("${app.jwt.issuer}") String issuer,
      Clock clock
  ) {
    byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
    this.secretKey = Keys.hmacShaKeyFor(keyBytes);
    this.issuer = issuer;
    this.clock = clock;
  }

  public String generateAccessToken(UUID userId, String username, UUID sessionId) {
    Instant now = Instant.now(clock);
    return Jwts.builder()
        .subject(userId.toString())
        .issuer(issuer)
        .issuedAt(Date.from(now))
        .claim("username", username)
        .claim("sid", sessionId == null ? null : sessionId.toString())
        .signWith(secretKey, SignatureAlgorithm.HS256)
        .compact();
  }

  public UUID extractUserId(String token) {
    return UUID.fromString(parseClaims(token).getSubject());
  }

  public String extractUsername(String token) {
    return parseClaims(token).get("username", String.class);
  }

  public UUID extractSessionId(String token) {
    String sessionId = parseClaims(token).get("sid", String.class);
    if (sessionId == null || sessionId.isBlank()) {
      return null;
    }
    return UUID.fromString(sessionId);
  }

  /**
   * Tokens carry no expiry: session lifetime is decided by the server (user_sessions).
   * This only verifies signature and issuer.
   */
  public boolean isValid(String token) {
    parseClaims(token);
    return true;
  }

  private Claims parseClaims(String token) {
    return Jwts.parser()
        .verifyWith(secretKey)
        .requireIssuer(issuer)
        .build()
        .parseSignedClaims(token)
        .getPayload();
  }
}
