package com.bridgit.api.providers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.bridgit.api.common.error.BadRequestException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SealedCursorServiceTest {

  private static final String KEY_BASE64 = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

  private final Clock clock = Clock.fixed(Instant.parse("2026-03-01T12:00:00Z"), ZoneOffset.UTC);
  private final SealedCursorService service = new SealedCursorService(KEY_BASE64, clock, new ObjectMapper());

  @Test
  void roundTripReturnsRawContinuation() {
    UUID connectionId = UUID.randomUUID();
    String sealed = service.seal(connectionId, null, "https://graph.microsoft.com/next?skip=1");

    assertEquals("https://graph.microsoft.com/next?skip=1", service.unseal(sealed, connectionId, null));
  }

  @Test
  void roundTripBindsFolder() {
    UUID connectionId = UUID.randomUUID();
    String sealed = service.seal(connectionId, "folder-1", "raw-2");

    assertEquals("raw-2", service.unseal(sealed, connectionId, "folder-1"));
  }

  @Test
  void sealBlankReturnsNull() {
    assertNull(service.seal(UUID.randomUUID(), null, null));
    assertNull(service.seal(UUID.randomUUID(), null, "  "));
  }

  @Test
  void invalidBase64Rejected() {
    assertInvalid("not-a-cursor!!!");
  }

  @Test
  void tamperedMacRejected() {
    UUID connectionId = UUID.randomUUID();
    String sealed = service.seal(connectionId, null, "raw");
    String tampered = sealed.substring(0, sealed.length() - 2) + "AA";

    assertInvalid(tampered);
  }

  @Test
  void cursorFromAnotherConnectionRejected() {
    String sealed = service.seal(UUID.randomUUID(), null, "raw");

    assertInvalidForConnection(sealed, UUID.randomUUID(), null);
  }

  @Test
  void cursorFromAnotherFolderRejected() {
    UUID connectionId = UUID.randomUUID();
    String sealed = service.seal(connectionId, "folder-1", "raw");

    assertInvalidForConnection(sealed, connectionId, "folder-2");
    assertInvalidForConnection(sealed, connectionId, null);
  }

  @Test
  void expiredCursorRejected() {
    UUID connectionId = UUID.randomUUID();
    String sealed = service.seal(connectionId, null, "raw");
    SealedCursorService later = new SealedCursorService(
        KEY_BASE64,
        Clock.offset(clock, java.time.Duration.ofHours(2)),
        new ObjectMapper()
    );

    BadRequestException ex = assertThrows(
        BadRequestException.class,
        () -> later.unseal(sealed, connectionId, null)
    );
    assertEquals("CURSOR_INVALIDO", ex.getCode());
  }

  private void assertInvalid(String cursor) {
    BadRequestException ex = assertThrows(
        BadRequestException.class,
        () -> service.unseal(cursor, UUID.randomUUID(), null)
    );
    assertEquals("CURSOR_INVALIDO", ex.getCode());
  }

  private void assertInvalidForConnection(String cursor, UUID connectionId, String parentRef) {
    BadRequestException ex = assertThrows(
        BadRequestException.class,
        () -> service.unseal(cursor, connectionId, parentRef)
    );
    assertEquals("CURSOR_INVALIDO", ex.getCode());
  }
}
