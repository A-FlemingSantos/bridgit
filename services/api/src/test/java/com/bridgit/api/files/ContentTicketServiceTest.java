package com.bridgit.api.files;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.bridgit.api.common.error.ApiException;
import com.bridgit.api.providers.ContentVariant;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class ContentTicketServiceTest {

  private static final String SECRET =
      "dev-only-local-jwt-secret-change-me-00000000000000000000000000000000";

  @Test
  void createsAndParsesTicket() {
    Clock clock = Clock.fixed(Instant.parse("2026-01-01T00:00:00Z"), ZoneOffset.UTC);
    ContentTicketService service = new ContentTicketService(SECRET, clock);
    UUID userId = UUID.randomUUID();
    UUID connectionId = UUID.randomUUID();

    ContentTicketService.IssuedTicket issued =
        service.createTicket(userId, connectionId, "item-ref", ContentVariant.READ, "inline");
    ContentTicketService.ContentTicket parsed = service.parseTicket(issued.ticket());

    assertEquals(userId, parsed.userId());
    assertEquals(connectionId, parsed.connectionId());
    assertEquals("item-ref", parsed.ref());
    assertEquals(ContentVariant.READ, parsed.variant());
    assertEquals("inline", parsed.disposition());
  }

  @Test
  void rejectsTamperedTicket() {
    ContentTicketService service = new ContentTicketService(SECRET, Clock.systemUTC());
    assertThrows(
        com.bridgit.api.common.error.NotFoundException.class,
        () -> service.parseTicket("invalid.ticket.value")
    );
  }

  @Test
  void expiredTicketProducesGoneWithDistinctCode() {
    Clock issuance = Clock.fixed(Instant.parse("2026-01-01T00:00:00Z"), ZoneOffset.UTC);
    ContentTicketService issuer = new ContentTicketService(SECRET, issuance);
    ContentTicketService.IssuedTicket issued = issuer.createTicket(
        UUID.randomUUID(), UUID.randomUUID(), "item-ref", ContentVariant.ORIGINAL, "inline");

    assertNotNull(issued.expiresAt());

    ContentTicketService parser = new ContentTicketService(
        SECRET, Clock.offset(issuance, Duration.ofMinutes(6)));
    ApiException ex = assertThrows(ApiException.class, () -> parser.parseTicket(issued.ticket()));
    assertEquals(HttpStatus.GONE, ex.getStatus());
    assertEquals("CONTEUDO_EXPIRADO", ex.getCode());
  }
}
