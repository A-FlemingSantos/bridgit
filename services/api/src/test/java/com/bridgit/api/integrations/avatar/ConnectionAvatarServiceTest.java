package com.bridgit.api.integrations.avatar;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.bridgit.api.integrations.AvatarImage;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionService;
import com.bridgit.api.integrations.ProviderOAuthClient;
import com.bridgit.api.integrations.ProviderOAuthClients;
import com.bridgit.api.integrations.ReconnectionRequiredException;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.ProviderApiException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

class ConnectionAvatarServiceTest {

  private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3};
  private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 1, 2};

  private final UUID userId = UUID.randomUUID();
  private final UUID connectionId = UUID.randomUUID();
  private final MutableClock clock = new MutableClock(Instant.parse("2026-10-23T12:00:00Z"));
  private final MapStore store = new MapStore();
  private final AtomicInteger fetches = new AtomicInteger();

  private ProviderConnectionService connections;
  private ProviderOAuthClient client;
  private ProviderConnectionEntity connection;
  private ConnectionAvatarService service;
  private Supplier<Optional<AvatarImage>> provider = Optional::empty;

  @BeforeEach
  void setUp() {
    connections = mock(ProviderConnectionService.class);
    connection = new ProviderConnectionEntity();
    connection.setId(connectionId);
    connection.setUserId(userId);
    connection.setProvider(CloudProvider.GOOGLE_DRIVE.id());
    connection.setGeneration(1);
    when(connections.findOwned(userId, connectionId)).thenReturn(Optional.of(connection));
    when(connections.accessToken(connection)).thenReturn("access-token");

    client = mock(ProviderOAuthClient.class);
    when(client.fetchAvatar("access-token")).thenAnswer(invocation -> {
      fetches.incrementAndGet();
      return provider.get();
    });
    ProviderOAuthClients clients = mock(ProviderOAuthClients.class);
    when(clients.get(CloudProvider.GOOGLE_DRIVE)).thenReturn(client);

    service = new ConnectionAvatarService(connections, clients, store, clock);
  }

  @Test
  void fetchesStoresAndThenServesFromTheCache() {
    // The provider's content type is not trusted: the PNG magic bytes decide.
    provider = () -> Optional.of(new AvatarImage(PNG, "text/html"));

    ConnectionAvatarService.Result first = service.find(userId, connectionId);
    ConnectionAvatarService.Result second = service.find(userId, connectionId);

    assertEquals(ConnectionAvatarService.Kind.FOUND, first.kind());
    assertEquals("image/png", first.avatar().contentType());
    assertArrayEquals(PNG, first.avatar().bytes());
    assertEquals(32, first.avatar().etag().length());
    assertEquals(ConnectionAvatarService.Kind.FOUND, second.kind());
    assertEquals(1, fetches.get());
    assertTrue(store.rows.get(connectionId).hasPhoto());
  }

  @Test
  void unknownOrForeignConnectionIsNotFoundAndNeverFetched() {
    UUID other = UUID.randomUUID();
    when(connections.findOwned(userId, other)).thenReturn(Optional.empty());

    assertEquals(ConnectionAvatarService.Kind.NOT_FOUND, service.find(userId, other).kind());
    assertEquals(ConnectionAvatarService.Kind.NOT_FOUND, service.find(UUID.randomUUID(), connectionId).kind());
    assertEquals(0, fetches.get());
  }

  @Test
  void noPhotoIsRememberedFor24Hours() {
    ConnectionAvatarService.Result first = service.find(userId, connectionId);
    clock.advance(Duration.ofHours(23));
    service.find(userId, connectionId);

    assertEquals(ConnectionAvatarService.Kind.NO_PHOTO, first.kind());
    assertFalse(store.rows.get(connectionId).hasPhoto());
    assertEquals(1, fetches.get());

    clock.advance(Duration.ofHours(2));
    service.find(userId, connectionId);
    assertEquals(2, fetches.get());
  }

  @Test
  void aPhotoIsRememberedFor7Days() {
    provider = () -> Optional.of(new AvatarImage(JPEG, "image/jpeg"));
    service.find(userId, connectionId);

    clock.advance(Duration.ofDays(6));
    service.find(userId, connectionId);
    assertEquals(1, fetches.get());

    clock.advance(Duration.ofDays(2));
    service.find(userId, connectionId);
    assertEquals(2, fetches.get());
  }

  @Test
  void aNewConnectionGenerationRefetches() {
    provider = () -> Optional.of(new AvatarImage(JPEG, "image/jpeg"));
    service.find(userId, connectionId);

    connection.setGeneration(2);
    service.find(userId, connectionId);

    assertEquals(2, fetches.get());
    assertEquals(2, store.rows.get(connectionId).generation());
  }

  @Test
  void reconnectionRequiredIsNotStoredAsNoPhoto() {
    when(connections.accessToken(connection)).thenThrow(new ReconnectionRequiredException());

    ConnectionAvatarService.Result result = service.find(userId, connectionId);

    assertEquals(ConnectionAvatarService.Kind.UNAVAILABLE, result.kind());
    assertTrue(store.rows.isEmpty());
    assertEquals(0, fetches.get());
  }

  @Test
  void transientProviderFailureIsNotStoredAndRetriedNextTime() {
    provider = () -> {
      throw new ProviderApiException("boom");
    };

    assertEquals(ConnectionAvatarService.Kind.UNAVAILABLE, service.find(userId, connectionId).kind());
    assertTrue(store.rows.isEmpty());

    provider = () -> Optional.of(new AvatarImage(PNG, "image/png"));
    assertEquals(ConnectionAvatarService.Kind.FOUND, service.find(userId, connectionId).kind());
    assertEquals(2, fetches.get());
  }

  @Test
  void bytesThatAreNotAnAllowedImageAreTreatedAsNoPhoto() {
    byte[] html = "<html><script>alert(1)</script></html>".getBytes();
    byte[] svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"/>".getBytes();

    for (byte[] bytes : new byte[][] {html, svg, new byte[0], new byte[ConnectionAvatarService.MAX_BYTES + 1]}) {
      store.rows.clear();
      provider = () -> Optional.of(new AvatarImage(bytes, "image/png"));

      assertEquals(ConnectionAvatarService.Kind.NO_PHOTO, service.find(userId, connectionId).kind());
      assertFalse(store.rows.get(connectionId).hasPhoto());
    }
  }

  @Test
  void aFailingStoreStillServesThePhoto() {
    provider = () -> Optional.of(new AvatarImage(PNG, "image/png"));
    store.failSaves = true;

    assertEquals(ConnectionAvatarService.Kind.FOUND, service.find(userId, connectionId).kind());
  }

  @Test
  void concurrentRequestsShareOneProviderFetch() throws Exception {
    CountDownLatch entered = new CountDownLatch(1);
    CountDownLatch release = new CountDownLatch(1);
    provider = () -> {
      entered.countDown();
      try {
        release.await(10, TimeUnit.SECONDS);
      } catch (InterruptedException ex) {
        Thread.currentThread().interrupt();
      }
      return Optional.of(new AvatarImage(PNG, "image/png"));
    };

    ExecutorService executor = Executors.newFixedThreadPool(2);
    try {
      Future<ConnectionAvatarService.Result> leader = executor.submit(() -> service.find(userId, connectionId));
      assertTrue(entered.await(10, TimeUnit.SECONDS));
      Future<ConnectionAvatarService.Result> follower = executor.submit(() -> service.find(userId, connectionId));
      // Give the follower time to reach the in-flight fetch before it is released.
      Thread.sleep(300);
      release.countDown();

      assertEquals(ConnectionAvatarService.Kind.FOUND, leader.get(10, TimeUnit.SECONDS).kind());
      assertEquals(ConnectionAvatarService.Kind.FOUND, follower.get(10, TimeUnit.SECONDS).kind());
      assertEquals(1, fetches.get());
    } finally {
      release.countDown();
      executor.shutdownNow();
    }
  }

  @Test
  void sniffsOnlyTheAllowedImageTypes() {
    assertEquals("image/jpeg", ConnectionAvatarService.sniffContentType(JPEG));
    assertEquals("image/png", ConnectionAvatarService.sniffContentType(PNG));
    assertEquals("image/gif", ConnectionAvatarService.sniffContentType("GIF89a....".getBytes()));
    assertEquals("image/gif", ConnectionAvatarService.sniffContentType("GIF87a....".getBytes()));
    assertEquals("image/webp", ConnectionAvatarService.sniffContentType("RIFF\0\0\0\0WEBPVP8 ".getBytes()));
    assertNull(ConnectionAvatarService.sniffContentType("RIFF\0\0\0\0WAVEfmt ".getBytes()));
    assertNull(ConnectionAvatarService.sniffContentType("GIF90a....".getBytes()));
    assertNull(ConnectionAvatarService.sniffContentType(new byte[] {(byte) 0xFF, (byte) 0xD8}));
    assertNull(ConnectionAvatarService.sniffContentType(new byte[0]));
  }

  private static final class MapStore implements ConnectionAvatarStore {
    final Map<UUID, StoredAvatar> rows = new HashMap<>();
    boolean failSaves;

    @Override
    public synchronized Optional<StoredAvatar> find(UUID connectionId) {
      return Optional.ofNullable(rows.get(connectionId));
    }

    @Override
    public synchronized void save(UUID connectionId, StoredAvatar avatar) {
      if (failSaves) {
        throw new DataIntegrityViolationException("fk");
      }
      rows.put(connectionId, avatar);
    }
  }

  private static final class MutableClock extends Clock {
    private Instant now;

    MutableClock(Instant now) {
      this.now = now;
    }

    void advance(Duration duration) {
      now = now.plus(duration);
    }

    @Override
    public ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return now;
    }
  }
}
