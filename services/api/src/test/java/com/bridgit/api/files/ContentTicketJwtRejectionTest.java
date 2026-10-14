package com.bridgit.api.files;

import static org.junit.jupiter.api.Assertions.assertThrows;

import com.bridgit.api.common.error.NotFoundException;
import com.bridgit.api.common.security.JwtKeys;
import com.bridgit.api.common.security.JwtService;
import com.bridgit.api.providers.ContentVariant;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ContentTicketJwtRejectionTest {

  private static final String SECRET =
      "dev-only-local-jwt-secret-change-me-00000000000000000000000000000000";

  @Test
  void authJwtServiceRejectsContentTicketIssuer() {
    Clock clock = Clock.fixed(Instant.parse("2026-01-01T00:00:00Z"), ZoneOffset.UTC);
    ContentTicketService contentTickets = new ContentTicketService(SECRET, clock);
    JwtService authJwt = new JwtService(SECRET, "bridgit-api", clock);

    ContentTicketService.IssuedTicket issued = contentTickets.createTicket(
        UUID.randomUUID(),
        UUID.randomUUID(),
        "ref",
        ContentVariant.ORIGINAL,
        "inline"
    );

    assertThrows(JwtException.class, () -> authJwt.extractUserId(issued.ticket()));
  }

  @Test
  void contentTicketsAreSignedWithTheirOwnKey() {
    Clock clock = Clock.fixed(Instant.parse("2026-01-01T00:00:00Z"), ZoneOffset.UTC);
    // A token with the content issuer and audience, but signed with the session key, is not a ticket.
    String forged = Jwts.builder()
        .subject(UUID.randomUUID().toString())
        .issuer(ContentTicketService.ISSUER)
        .audience().add(ContentTicketService.AUDIENCE).and()
        .expiration(Date.from(Instant.parse("2026-01-01T00:05:00Z")))
        .claim("cid", UUID.randomUUID().toString())
        .claim("ref", "ref")
        .claim("variant", ContentVariant.ORIGINAL.name())
        .claim("disp", "inline")
        .signWith(JwtKeys.sessionKey(SECRET))
        .compact();

    assertThrows(NotFoundException.class, () -> new ContentTicketService(SECRET, clock).parseTicket(forged));
  }
}
