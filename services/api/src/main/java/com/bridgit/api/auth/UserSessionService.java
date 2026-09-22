package com.bridgit.api.auth;

import com.bridgit.api.common.error.UnauthorizedException;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Locale;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserSessionService {

  private static final Duration LAST_SEEN_REFRESH_INTERVAL = Duration.ofMinutes(5);

  private final UserSessionRepository userSessionRepository;
  private final Clock clock;

  public UserSessionService(UserSessionRepository userSessionRepository, Clock clock) {
    this.userSessionRepository = userSessionRepository;
    this.clock = clock;
  }

  @Transactional
  public UserSessionEntity createSession(UUID userId, UUID deviceKey, boolean persistent, String userAgent) {
    OffsetDateTime now = OffsetDateTime.now(clock);
    userSessionRepository.revokeActiveByDeviceKey(userId, deviceKey, now);

    UserSessionEntity session = new UserSessionEntity();
    session.setUserId(userId);
    session.setDeviceKey(deviceKey);
    session.setPersistent(persistent);
    session.setUserAgent(normalizeUserAgent(userAgent));
    session.setLastSeenAt(now);
    return userSessionRepository.save(session);
  }

  @Transactional(readOnly = true)
  public UserSessionEntity requireActiveSession(UUID userId, UUID sessionId) {
    UserSessionEntity session = userSessionRepository.findByIdAndUserId(sessionId, userId)
        .orElseThrow(() -> new UnauthorizedException("SESSAO_INVALIDA", "Sua sessao nao e mais valida."));

    if (session.getRevokedAt() != null) {
      throw new UnauthorizedException("SESSAO_REVOGADA", "Sua sessao foi encerrada. Faca login novamente.");
    }

    return session;
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
    session.setPersistent(persistent);
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
