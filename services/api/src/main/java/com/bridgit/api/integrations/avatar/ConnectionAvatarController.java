package com.bridgit.api.integrations.avatar;

import com.bridgit.api.common.api.ApiEnvelope;
import com.bridgit.api.common.api.ApiErrorResponse;
import com.bridgit.api.common.security.AuthenticatedUserService;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/connections")
public class ConnectionAvatarController {

  static final String UNAVAILABLE_CODE = "AVATAR_INDISPONIVEL";
  private static final String PHOTO_CACHE = "private, max-age=86400";
  private static final String NO_PHOTO_CACHE = "private, max-age=3600";
  private static final String NO_CACHE = "no-store";

  private final ConnectionAvatarService avatarService;
  private final AuthenticatedUserService authenticatedUserService;
  private final Clock clock;

  public ConnectionAvatarController(
      ConnectionAvatarService avatarService,
      AuthenticatedUserService authenticatedUserService,
      Clock clock
  ) {
    this.avatarService = avatarService;
    this.authenticatedUserService = authenticatedUserService;
    this.clock = clock;
  }

  @GetMapping("/{connectionId}/avatar")
  public ResponseEntity<?> avatar(
      @PathVariable String connectionId,
      @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch,
      HttpServletRequest request
  ) {
    UUID userId = authenticatedUserService.requireUserId();
    UUID id = parse(connectionId);
    ConnectionAvatarService.Result result = id == null
        ? ConnectionAvatarService.Result.NOT_FOUND
        : avatarService.find(userId, id);

    return switch (result.kind()) {
      case FOUND -> photo(result.avatar(), ifNoneMatch);
      case NO_PHOTO -> unavailable(request, NO_PHOTO_CACHE);
      case UNAVAILABLE, NOT_FOUND -> unavailable(request, NO_CACHE);
    };
  }

  private ResponseEntity<?> photo(StoredAvatar avatar, String ifNoneMatch) {
    String etag = "\"" + avatar.etag() + "\"";
    if (matches(ifNoneMatch, etag)) {
      return ResponseEntity.status(HttpStatus.NOT_MODIFIED)
          .header(HttpHeaders.CACHE_CONTROL, PHOTO_CACHE)
          .header(HttpHeaders.ETAG, etag)
          .header("X-Content-Type-Options", "nosniff")
          .build();
    }
    return ResponseEntity.ok()
        .header(HttpHeaders.CACHE_CONTROL, PHOTO_CACHE)
        .header(HttpHeaders.ETAG, etag)
        .header("X-Content-Type-Options", "nosniff")
        .contentType(MediaType.parseMediaType(avatar.contentType()))
        .contentLength(avatar.bytes().length)
        .body(avatar.bytes());
  }

  private ResponseEntity<?> unavailable(HttpServletRequest request, String cacheControl) {
    ApiErrorResponse error = new ApiErrorResponse(
        UNAVAILABLE_CODE,
        "A foto de perfil desta conta não está disponível.",
        request.getRequestURI(),
        OffsetDateTime.now(clock),
        null
    );
    return ResponseEntity.status(HttpStatus.NOT_FOUND)
        .header(HttpHeaders.CACHE_CONTROL, cacheControl)
        .header("X-Content-Type-Options", "nosniff")
        .contentType(MediaType.APPLICATION_JSON)
        .body(ApiEnvelope.error(error));
  }

  /** If-None-Match: a list of entity tags, or {@code *}; weak tags compare equal here. */
  static boolean matches(String ifNoneMatch, String etag) {
    if (ifNoneMatch == null || ifNoneMatch.isBlank()) {
      return false;
    }
    for (String candidate : ifNoneMatch.split(",")) {
      String tag = candidate.trim();
      if (tag.startsWith("W/")) {
        tag = tag.substring(2);
      }
      if (tag.equals("*") || tag.equals(etag)) {
        return true;
      }
    }
    return false;
  }

  private static UUID parse(String value) {
    try {
      return UUID.fromString(value);
    } catch (IllegalArgumentException ex) {
      return null;
    }
  }
}
