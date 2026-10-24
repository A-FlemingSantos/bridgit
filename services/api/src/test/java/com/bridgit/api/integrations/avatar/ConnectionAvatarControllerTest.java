package com.bridgit.api.integrations.avatar;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.bridgit.api.common.api.ApiEnvelope;
import com.bridgit.api.common.security.AuthenticatedUserService;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

class ConnectionAvatarControllerTest {

  private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3};

  private final UUID userId = UUID.randomUUID();
  private final UUID connectionId = UUID.randomUUID();
  private ConnectionAvatarService service;
  private ConnectionAvatarController controller;
  private final MockHttpServletRequest request = new MockHttpServletRequest();

  @BeforeEach
  void setUp() {
    service = mock(ConnectionAvatarService.class);
    AuthenticatedUserService users = mock(AuthenticatedUserService.class);
    when(users.requireUserId()).thenReturn(userId);
    controller = new ConnectionAvatarController(
        service, users, Clock.fixed(Instant.parse("2026-10-23T12:00:00Z"), ZoneOffset.UTC));
    request.setRequestURI("/api/connections/" + connectionId + "/avatar");
  }

  private static StoredAvatar photo() {
    return StoredAvatar.photo(1, "image/png", PNG, "abc123", OffsetDateTime.now());
  }

  @Test
  void servesThePhotoWithCachingAndHardeningHeaders() {
    when(service.find(userId, connectionId))
        .thenReturn(new ConnectionAvatarService.Result(ConnectionAvatarService.Kind.FOUND, photo()));

    ResponseEntity<?> response = controller.avatar(connectionId.toString(), null, request);

    assertEquals(HttpStatus.OK, response.getStatusCode());
    assertEquals(MediaType.IMAGE_PNG, response.getHeaders().getContentType());
    assertEquals("private, max-age=86400", response.getHeaders().getCacheControl());
    assertEquals("\"abc123\"", response.getHeaders().getETag());
    assertEquals("nosniff", response.getHeaders().getFirst("X-Content-Type-Options"));
    assertArrayEquals(PNG, (byte[]) response.getBody());
  }

  @Test
  void answers304WhenTheEtagMatches() {
    when(service.find(userId, connectionId))
        .thenReturn(new ConnectionAvatarService.Result(ConnectionAvatarService.Kind.FOUND, photo()));

    for (String header : new String[] {"\"abc123\"", "W/\"abc123\"", "\"zzz\", \"abc123\"", "*"}) {
      ResponseEntity<?> response = controller.avatar(connectionId.toString(), header, request);

      assertEquals(HttpStatus.NOT_MODIFIED, response.getStatusCode(), header);
      assertNull(response.getBody());
      assertEquals("\"abc123\"", response.getHeaders().getETag());
    }
    assertEquals(HttpStatus.OK, controller.avatar(connectionId.toString(), "\"other\"", request).getStatusCode());
  }

  @Test
  void noPhotoIs404WithTheErrorCodeAndShortCaching() {
    when(service.find(userId, connectionId)).thenReturn(ConnectionAvatarService.Result.NO_PHOTO);

    ResponseEntity<?> response = controller.avatar(connectionId.toString(), null, request);

    assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    assertEquals("private, max-age=3600", response.getHeaders().getCacheControl());
    ApiEnvelope<?> body = (ApiEnvelope<?>) response.getBody();
    assertFalse(body.success());
    assertEquals("AVATAR_INDISPONIVEL", body.error().code());
    assertEquals(request.getRequestURI(), body.error().path());
  }

  @Test
  void unavailableAndForeignConnectionsAre404WithoutCaching() {
    when(service.find(userId, connectionId)).thenReturn(ConnectionAvatarService.Result.UNAVAILABLE);

    ResponseEntity<?> unavailable = controller.avatar(connectionId.toString(), null, request);
    ResponseEntity<?> malformed = controller.avatar("not-a-uuid", null, request);

    for (ResponseEntity<?> response : new ResponseEntity<?>[] {unavailable, malformed}) {
      assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
      assertEquals("no-store", response.getHeaders().getCacheControl());
      assertEquals("AVATAR_INDISPONIVEL", ((ApiEnvelope<?>) response.getBody()).error().code());
    }
    assertTrue(ConnectionAvatarController.matches("*", "\"x\""));
  }
}
