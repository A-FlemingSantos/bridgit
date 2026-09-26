package com.bridgit.api.files;

import com.bridgit.api.common.error.ApiException;
import com.bridgit.api.common.error.NotFoundException;
import com.bridgit.api.providers.ContentVariant;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
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
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class ContentTicketService {

  public static final String ISSUER = "bridgit-content";
  public static final String AUDIENCE = "bridgit-content";

  private final SecretKey secretKey;
  private final Clock clock;

  public ContentTicketService(
      @Value("${app.jwt.secret}") String secret,
      Clock clock
  ) {
    this.secretKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    this.clock = clock;
  }

  public IssuedTicket createTicket(
      UUID userId,
      UUID connectionId,
      String ref,
      ContentVariant variant,
      String disposition
  ) {
    Instant now = Instant.now(clock);
    Instant expiresAt = now.plus(5, ChronoUnit.MINUTES);
    String ticket = Jwts.builder()
        .subject(userId.toString())
        .issuer(ISSUER)
        .audience().add(AUDIENCE).and()
        .issuedAt(Date.from(now))
        .expiration(Date.from(expiresAt))
        .claim("cid", connectionId.toString())
        .claim("ref", ref)
        .claim("variant", variant.name())
        .claim("disp", disposition)
        .signWith(secretKey, SignatureAlgorithm.HS256)
        .compact();
    return new IssuedTicket(ticket, OffsetDateTime.ofInstant(expiresAt, ZoneOffset.UTC));
  }

  public ContentTicket parseTicket(String ticket) {
    try {
      Claims claims = Jwts.parser()
          .verifyWith(secretKey)
          .requireIssuer(ISSUER)
          .requireAudience(AUDIENCE)
          .clock(() -> Date.from(Instant.now(clock)))
          .build()
          .parseSignedClaims(ticket)
          .getPayload();

      return new ContentTicket(
          UUID.fromString(claims.getSubject()),
          UUID.fromString(claims.get("cid", String.class)),
          claims.get("ref", String.class),
          ContentVariant.valueOf(claims.get("variant", String.class)),
          claims.get("disp", String.class)
      );
    } catch (ExpiredJwtException ex) {
      throw new ApiException(
          HttpStatus.GONE,
          "CONTEUDO_EXPIRADO",
          "Este conteudo expirou. Gere um novo link para continuar."
      );
    } catch (JwtException | IllegalArgumentException ex) {
      throw invalidTicket();
    }
  }

  private static NotFoundException invalidTicket() {
    return new NotFoundException("CONTEUDO_NAO_ENCONTRADO", "Conteudo nao encontrado ou expirado.");
  }

  public record IssuedTicket(String ticket, OffsetDateTime expiresAt) {
  }

  public record ContentTicket(
      UUID userId,
      UUID connectionId,
      String ref,
      ContentVariant variant,
      String disposition
  ) {
    public boolean attachment() {
      return "attachment".equalsIgnoreCase(disposition);
    }
  }
}
