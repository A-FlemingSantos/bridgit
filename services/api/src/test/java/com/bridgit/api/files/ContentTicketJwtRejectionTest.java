package com.bridgit.api.files;

import static org.junit.jupiter.api.Assertions.assertThrows;

import com.bridgit.api.common.security.JwtService;
import com.bridgit.api.providers.ContentVariant;
import io.jsonwebtoken.JwtException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ContentTicketJwtRejectionTest {

  private static final String SECRET =
      "dev-only-local-jwt-secret-change-me-00000000000000000000000000000000";

  @Test
  void authJwtServiceRejectsContentTicketIssuer() {
    Clock clock = Clock.fixed(Instant.parse("2026-01-01T00:00:00Z"), ZoneOffset.UTC);
    ContentTicketService contentTickets = new ContentTicketService(SECRET, clock);
    JwtService authJwt = new JwtService(SECRET, "bridgit-api", 180, clock);

    String ticket = contentTickets.createTicket(
        UUID.randomUUID(),
        UUID.randomUUID(),
        "ref",
        ContentVariant.ORIGINAL,
        "inline"
    );

    assertThrows(JwtException.class, () -> authJwt.extractUserId(ticket));
  }
}
