package com.bridgit.api.auth;

import com.bridgit.api.common.error.UnauthorizedException;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserSessionService {

  private static final Duration LAST_SEEN_REFRESH_INTERVAL = Duration.ofMinutes(5);
  private static final Duration UNREMEMBERED_WINDOW = Duration.ofHours(2);
  private static final Duration REMEMBERED_IDLE_LIMIT = Duration.ofDays(7);

  private final UserSessionRepository userSessionRepository;
  private final Clock clock;

  public UserSessionService(UserSessionRepository userSessionRepository, Clock clock) {
    this.userSessionRepository = userSessionRepository;
    this.clock = clock;
  }

  @Transactional
  public UserSessionEntity createSession(
      UUID userId,
      UUID deviceKey,
      ClientKind clientKind,
      boolean persistent,
      String userAgent
  ) {
    OffsetDateTime now = OffsetDateTime.now(clock);
    userSessionRepository.revokeActiveByDeviceKey(userId, deviceKey, now);

    UserSessionEntity session = new UserSessionEntity();
    session.setUserId(userId);
    session.setDeviceKey(deviceKey);
    session.setClientKind(clientKind);
    session.setPersistent(clientKind == ClientKind.MOBILE || persistent);
    session.setUserAgent(normalizeUserAgent(userAgent));
    session.setLastSeenAt(now);
    session.setWindowStartedAt(now);
    return userSessionRepository.save(session);
  }

  @Transactional(readOnly = true)
  public List<UserSessionEntity> listActive(UUID userId) {
    OffsetDateTime now = OffsetDateTime.now(clock);
    return userSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastSeenAtDesc(userId).stream()
        .filter(session -> !isExpired(session, now))
        .toList();
  }

  @Transactional(readOnly = true)
  public UserSessionEntity requireActiveSession(UUID userId, UUID sessionId) {
    UserSessionEntity session = userSessionRepository.findByIdAndUserId(sessionId, userId)
        .orElseThrow(() -> new UnauthorizedException("SESSAO_INVALIDA", "Sua sessao nao e mais valida."));

    if (session.getRevokedAt() != null) {
      throw new UnauthorizedException("SESSAO_REVOGADA", "Sua sessao foi encerrada. Faca login novamente.");
    }

    if (isExpired(session, OffsetDateTime.now(clock))) {
      throw new UnauthorizedException("SESSAO_EXPIRADA", "Sua sessao expirou. Faca login novamente.");
    }

    return session;
  }

  /**
   * Server-side session lifetime. Mobile never expires; web without "remember" has an absolute
   * window from login (or from turning "remember" off); web with "remember" expires after
   * {@link #REMEMBERED_IDLE_LIMIT} without use. Returns null when the session does not expire.
   */
  public OffsetDateTime expiresAt(UserSessionEntity session) {
    if (session.getClientKind() == ClientKind.MOBILE) {
      return null;
    }
    if (session.isPersistent()) {
      return session.getLastSeenAt().plus(REMEMBERED_IDLE_LIMIT);
    }
    return session.getWindowStartedAt().plus(UNREMEMBERED_WINDOW);
  }

  private boolean isExpired(UserSessionEntity session, OffsetDateTime now) {
    OffsetDateTime expiresAt = expiresAt(session);
    return expiresAt != null && !now.isBefore(expiresAt);
  }

  @Transactional
  public void touchSession(UserSessionEntity session) {
    OffsetDateTime now = OffsetDateTime.now(clock);
    OffsetDateTime lastSeenAt = session.getLastSeenAt();

    if (lastSeenAt != null && lastSeenAt.plus(LAST_SEEN_REFRESH_INTERVAL).isAfter(now)) {
      return;
    }

    session.setLastSeenAt(now);
    userSessionRepository.save(session);
  }

  @Transactional
  public UserSessionEntity updatePersistent(UUID userId, UUID sessionId, boolean persistent) {
    UserSessionEntity session = requireActiveSession(userId, sessionId);
    if (session.getClientKind() == ClientKind.MOBILE || session.isPersistent() == persistent) {
      return session;
    }

    OffsetDateTime now = OffsetDateTime.now(clock);
    session.setPersistent(persistent);
    if (persistent) {
      session.setLastSeenAt(now);
    } else {
      session.setWindowStartedAt(now);
    }
    return userSessionRepository.save(session);
  }

  @Transactional
  public void revokeCurrentSession(UUID userId, UUID sessionId) {
    userSessionRepository.revokeOne(userId, sessionId, OffsetDateTime.now(clock));
  }

  @Transactional
  public void revokeOtherSessions(UUID userId, UUID currentSessionId) {
    userSessionRepository.revokeAllExcept(userId, currentSessionId, OffsetDateTime.now(clock));
  }

  private String normalizeUserAgent(String userAgent) {
    if (userAgent == null || userAgent.isBlank()) {
      return null;
    }

    String trimmed = userAgent.trim();
    return trimmed.length() > 1000 ? trimmed.substring(0, 1000) : trimmed;
  }
}
