package com.bridgit.api.common.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class JwtService {

  private final SecretKey secretKey;
  private final String issuer;
  private final long accessTokenMinutes;
  private final Clock clock;

  public JwtService(
      @Value("${app.jwt.secret}") String secret,
      @Value("${app.jwt.issuer}") String issuer,
      @Value("${app.jwt.access-token-minutes}") long accessTokenMinutes,
      Clock clock
  ) {
    byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
    this.secretKey = Keys.hmacShaKeyFor(keyBytes);
    this.issuer = issuer;
    this.accessTokenMinutes = accessTokenMinutes;
    this.clock = clock;
  }

  public String generateAccessToken(UUID userId, String username, UUID sessionId) {
    Instant now = Instant.now(clock);
    return Jwts.builder()
        .subject(userId.toString())
        .issuer(issuer)
        .issuedAt(Date.from(now))
        .expiration(Date.from(now.plus(accessTokenMinutes, ChronoUnit.MINUTES)))
        .claim("username", username)
        .claim("sid", sessionId == null ? null : sessionId.toString())
        .signWith(secretKey, SignatureAlgorithm.HS256)
        .compact();
  }

  public OffsetDateTime accessTokenExpiresAt() {
    return OffsetDateTime.ofInstant(
        Instant.now(clock).plus(accessTokenMinutes, ChronoUnit.MINUTES),
        ZoneOffset.UTC
    );
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

  public boolean isValid(String token) {
    Claims claims = parseClaims(token);
    return claims.getExpiration().toInstant().isAfter(Instant.now(clock));
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
