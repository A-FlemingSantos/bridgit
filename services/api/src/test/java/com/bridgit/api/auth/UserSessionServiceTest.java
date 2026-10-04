package com.bridgit.api.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.bridgit.api.common.error.UnauthorizedException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class UserSessionServiceTest {

  private static final Instant START = Instant.parse("2026-01-01T00:00:00Z");

  private final UUID userId = UUID.randomUUID();
  private final UUID deviceKey = UUID.randomUUID();
  private final MutableClock clock = new MutableClock(START);

  private UserSessionRepository repository;
  private UserSessionService service;

  @BeforeEach
  void setUp() {
    repository = mock(UserSessionRepository.class);
    when(repository.save(any(UserSessionEntity.class))).thenAnswer(invocation -> {
      UserSessionEntity saved = invocation.getArgument(0);
      if (saved.getId() == null) {
        saved.prePersist();
      }
      return saved;
    });
    service = new UserSessionService(repository, clock);
  }

  private UserSessionEntity create(ClientKind kind, boolean persistent) {
    UserSessionEntity session = service.createSession(userId, deviceKey, kind, persistent, "agent");
    when(repository.findByIdAndUserId(session.getId(), userId)).thenReturn(Optional.of(session));
    return session;
  }

  @Test
  void webWithoutRememberHasAbsoluteTwoHourWindowEvenWithContinuousUse() {
    UserSessionEntity session = create(ClientKind.WEB, false);
    assertEquals(OffsetDateTime.ofInstant(START.plus(Duration.ofHours(2)), ZoneOffset.UTC),
        service.expiresAt(session).withOffsetSameInstant(ZoneOffset.UTC));

    for (int minute = 10; minute < 120; minute += 10) {
      clock.set(START.plus(Duration.ofMinutes(minute)));
      service.touchSession(service.requireActiveSession(userId, session.getId()));
    }

    clock.set(START.plus(Duration.ofHours(2)));
    UnauthorizedException error = assertThrows(
        UnauthorizedException.class,
        () -> service.requireActiveSession(userId, session.getId())
    );
    assertEquals("SESSAO_EXPIRADA", error.getCode());
  }

  @Test
  void webWithRememberSlidesAndExpiresAfterSevenIdleDays() {
    UserSessionEntity session = create(ClientKind.WEB, true);

    clock.set(START.plus(Duration.ofDays(6)));
    service.touchSession(service.requireActiveSession(userId, session.getId()));

    clock.set(START.plus(Duration.ofDays(12)));
    service.requireActiveSession(userId, session.getId());

    clock.set(START.plus(Duration.ofDays(13)));
    assertThrows(UnauthorizedException.class, () -> service.requireActiveSession(userId, session.getId()));
  }

  @Test
  void turningRememberOffStartsNewTwoHourWindowFromTheToggle() {
    UserSessionEntity session = create(ClientKind.WEB, true);
    clock.set(START.plus(Duration.ofDays(3)));

    service.updatePersistent(userId, session.getId(), false);

    clock.set(START.plus(Duration.ofDays(3)).plus(Duration.ofMinutes(119)));
    service.requireActiveSession(userId, session.getId());

    clock.set(START.plus(Duration.ofDays(3)).plus(Duration.ofHours(2)));
    assertThrows(UnauthorizedException.class, () -> service.requireActiveSession(userId, session.getId()));
  }

  @Test
  void turningRememberOnSwitchesToSlidingWindowFromTheToggle() {
    UserSessionEntity session = create(ClientKind.WEB, false);
    clock.set(START.plus(Duration.ofMinutes(100)));

    service.updatePersistent(userId, session.getId(), true);

    clock.set(START.plus(Duration.ofHours(5)));
    service.requireActiveSession(userId, session.getId());
    assertEquals(
        OffsetDateTime.ofInstant(START.plus(Duration.ofMinutes(100)).plus(Duration.ofDays(7)), ZoneOffset.UTC),
        service.expiresAt(session).withOffsetSameInstant(ZoneOffset.UTC)
    );
  }

  @Test
  void mobileNeverExpiresAndIgnoresPersistentToggle() {
    UserSessionEntity session = create(ClientKind.MOBILE, false);
    assertTrue(session.isPersistent());
    assertNull(service.expiresAt(session));

    clock.set(START.plus(Duration.ofDays(3650)));
    service.requireActiveSession(userId, session.getId());

    service.updatePersistent(userId, session.getId(), false);
    assertTrue(session.isPersistent());
    assertNull(service.expiresAt(session));
  }

  @Test
  void listActiveSkipsExpiredSessions() {
    UserSessionEntity web = create(ClientKind.WEB, false);
    UserSessionEntity mobile = create(ClientKind.MOBILE, true);
    when(repository.findByUserIdAndRevokedAtIsNullOrderByLastSeenAtDesc(userId))
        .thenReturn(List.of(web, mobile));

    clock.set(START.plus(Duration.ofHours(3)));

    assertEquals(List.of(mobile), service.listActive(userId));
  }

  private static final class MutableClock extends Clock {

    private Instant instant;

    MutableClock(Instant instant) {
      this.instant = instant;
    }

    void set(Instant instant) {
      this.instant = instant;
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
      return instant;
    }
  }
}
