package com.bridgit.api.auth;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserSessionRepository extends JpaRepository<UserSessionEntity, UUID> {

  Optional<UserSessionEntity> findByIdAndUserId(UUID id, UUID userId);

  Optional<UserSessionEntity> findByUserIdAndDeviceKeyAndRevokedAtIsNull(UUID userId, UUID deviceKey);

  @Modifying
  @Query("""
      update UserSessionEntity session
      set session.revokedAt = :revokedAt
      where session.userId = :userId
        and session.deviceKey = :deviceKey
        and session.revokedAt is null
      """)
  int revokeActiveByDeviceKey(
      @Param("userId") UUID userId,
      @Param("deviceKey") UUID deviceKey,
      @Param("revokedAt") OffsetDateTime revokedAt
  );

  @Modifying
  @Query("""
      update UserSessionEntity session
      set session.revokedAt = :revokedAt
      where session.userId = :userId
        and session.revokedAt is null
        and (:keepSessionId is null or session.id <> :keepSessionId)
      """)
  int revokeAllExcept(
      @Param("userId") UUID userId,
      @Param("keepSessionId") UUID keepSessionId,
      @Param("revokedAt") OffsetDateTime revokedAt
  );

  @Modifying
  @Query("""
      update UserSessionEntity session
      set session.revokedAt = :revokedAt
      where session.userId = :userId
        and session.id = :sessionId
        and session.revokedAt is null
      """)
  int revokeOne(
      @Param("userId") UUID userId,
      @Param("sessionId") UUID sessionId,
      @Param("revokedAt") OffsetDateTime revokedAt
  );
}
