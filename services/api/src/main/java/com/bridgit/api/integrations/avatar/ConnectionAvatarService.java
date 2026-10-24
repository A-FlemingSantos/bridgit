package com.bridgit.api.integrations.avatar;

import com.bridgit.api.integrations.AvatarImage;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionService;
import com.bridgit.api.integrations.ProviderOAuthClients;
import com.bridgit.api.integrations.ReconnectionRequiredException;
import com.bridgit.api.providers.CloudProvider;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

/**
 * Serves each connected account's profile photo from a database cache, fetching it from the
 * provider on demand. Deliberately not transactional: the provider HTTP call must never run inside
 * a database transaction.
 */
@Service
public class ConnectionAvatarService {

  private static final Logger log = LoggerFactory.getLogger(ConnectionAvatarService.class);

  static final int MAX_BYTES = 1024 * 1024;
  static final Duration PHOTO_TTL = Duration.ofDays(7);
  static final Duration NO_PHOTO_TTL = Duration.ofHours(24);
  private static final int ETAG_HEX_LENGTH = 32;

  public enum Kind {
    /** The account has a photo. */
    FOUND,
    /** The provider confirmed the account has no photo. */
    NO_PHOTO,
    /** Could not find out right now (provider failure, reconnect required): never cached. */
    UNAVAILABLE,
    /** Unknown connection, or one that belongs to someone else. */
    NOT_FOUND
  }

  public record Result(Kind kind, StoredAvatar avatar) {
    public static final Result NO_PHOTO = new Result(Kind.NO_PHOTO, null);
    public static final Result UNAVAILABLE = new Result(Kind.UNAVAILABLE, null);
    public static final Result NOT_FOUND = new Result(Kind.NOT_FOUND, null);

    static Result of(StoredAvatar avatar) {
      return avatar.hasPhoto() ? new Result(Kind.FOUND, avatar) : NO_PHOTO;
    }
  }

  private final ProviderConnectionService connections;
  private final ProviderOAuthClients oauthClients;
  private final ConnectionAvatarStore store;
  private final Clock clock;
  private final ConcurrentHashMap<UUID, CompletableFuture<Result>> inFlight = new ConcurrentHashMap<>();

  public ConnectionAvatarService(
      ProviderConnectionService connections,
      ProviderOAuthClients oauthClients,
      ConnectionAvatarStore store,
      Clock clock
  ) {
    this.connections = connections;
    this.oauthClients = oauthClients;
    this.store = store;
    this.clock = clock;
  }

  public Result find(UUID userId, UUID connectionId) {
    Optional<ProviderConnectionEntity> owned = connections.findOwned(userId, connectionId);
    if (owned.isEmpty()) {
      return Result.NOT_FOUND;
    }
    ProviderConnectionEntity connection = owned.get();
    Optional<StoredAvatar> cached = store.find(connectionId);
    if (cached.isPresent() && isFresh(cached.get(), connection.getGeneration())) {
      return Result.of(cached.get());
    }
    return refresh(connection);
  }

  private boolean isFresh(StoredAvatar cached, long generation) {
    if (cached.generation() != generation || cached.fetchedAt() == null) {
      return false;
    }
    Duration ttl = cached.hasPhoto() ? PHOTO_TTL : NO_PHOTO_TTL;
    return cached.fetchedAt().toInstant().plus(ttl).isAfter(clock.instant());
  }

  /** One provider fetch per connection at a time; concurrent callers share its outcome. */
  private Result refresh(ProviderConnectionEntity connection) {
    UUID id = connection.getId();
    CompletableFuture<Result> mine = new CompletableFuture<>();
    CompletableFuture<Result> running = inFlight.putIfAbsent(id, mine);
    if (running != null) {
      try {
        return running.join();
      } catch (CompletionException | CancellationException ex) {
        return Result.UNAVAILABLE;
      }
    }
    Result result = Result.UNAVAILABLE;
    try {
      result = fetchAndStore(connection);
      return result;
    } finally {
      mine.complete(result);
      inFlight.remove(id, mine);
    }
  }

  private Result fetchAndStore(ProviderConnectionEntity connection) {
    Optional<AvatarImage> image;
    try {
      String accessToken = connections.accessToken(connection);
      image = oauthClients.get(CloudProvider.fromId(connection.getProvider())).fetchAvatar(accessToken);
    } catch (ReconnectionRequiredException ex) {
      log.debug("Avatar unavailable for connection {}: reconnection required", connection.getId());
      return Result.UNAVAILABLE;
    } catch (RuntimeException ex) {
      // Class only: provider errors may carry tokens or URLs.
      log.warn("Avatar fetch failed for connection {} ({}): {}",
          connection.getId(), connection.getProvider(), ex.getClass().getSimpleName());
      return Result.UNAVAILABLE;
    }

    StoredAvatar stored = toStored(image, connection.getGeneration());
    try {
      store.save(connection.getId(), stored);
    } catch (DataAccessException ex) {
      // E.g. the connection was removed meanwhile. The photo is still good for this response.
      log.debug("Avatar of connection {} not stored: {}", connection.getId(), ex.getClass().getSimpleName());
    }
    return Result.of(stored);
  }

  private StoredAvatar toStored(Optional<AvatarImage> image, long generation) {
    OffsetDateTime now = OffsetDateTime.ofInstant(clock.instant(), clock.getZone());
    if (image == null || image.isEmpty()) {
      return StoredAvatar.none(generation, now);
    }
    byte[] bytes = image.get().bytes();
    if (bytes == null || bytes.length == 0 || bytes.length > MAX_BYTES) {
      return StoredAvatar.none(generation, now);
    }
    // The provider's Content-Type is not trusted: the type is derived from the bytes.
    String contentType = sniffContentType(bytes);
    if (contentType == null) {
      return StoredAvatar.none(generation, now);
    }
    return StoredAvatar.photo(generation, contentType, bytes, etagOf(bytes), now);
  }

  /** The allowed image type the bytes start with, or null. */
  static String sniffContentType(byte[] b) {
    if (b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) {
      return "image/jpeg";
    }
    if (b.length >= 8 && (b[0] & 0xFF) == 0x89 && hasAscii(b, 1, "PNG") && b[4] == 0x0D && b[5] == 0x0A
        && b[6] == 0x1A && b[7] == 0x0A) {
      return "image/png";
    }
    if (b.length >= 6 && hasAscii(b, 0, "GIF8") && (b[4] == '7' || b[4] == '9') && b[5] == 'a') {
      return "image/gif";
    }
    if (b.length >= 12 && hasAscii(b, 0, "RIFF") && hasAscii(b, 8, "WEBP")) {
      return "image/webp";
    }
    return null;
  }

  private static boolean hasAscii(byte[] b, int offset, String ascii) {
    byte[] expected = ascii.getBytes(StandardCharsets.US_ASCII);
    for (int i = 0; i < expected.length; i++) {
      if (b[offset + i] != expected[i]) {
        return false;
      }
    }
    return true;
  }

  static String etagOf(byte[] bytes) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
      return HexFormat.of().formatHex(digest).substring(0, ETAG_HEX_LENGTH);
    } catch (NoSuchAlgorithmException ex) {
      throw new IllegalStateException("SHA-256 indisponível.", ex);
    }
  }
}
