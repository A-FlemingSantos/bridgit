package com.bridgit.api.auth;

import com.bridgit.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "user_sessions")
public class UserSessionEntity extends BaseEntity {

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "device_key", nullable = false)
  private UUID deviceKey;

  @Column(nullable = false)
  private boolean persistent;

  @Column(length = 1000)
  private String userAgent;

  @Column(name = "last_seen_at", nullable = false)
  private OffsetDateTime lastSeenAt;

  @Column(name = "revoked_at")
  private OffsetDateTime revokedAt;

  public UUID getUserId() {
    return userId;
  }

  public void setUserId(UUID userId) {
    this.userId = userId;
  }

  public UUID getDeviceKey() {
    return deviceKey;
  }

  public void setDeviceKey(UUID deviceKey) {
    this.deviceKey = deviceKey;
  }

  public boolean isPersistent() {
    return persistent;
  }

  public void setPersistent(boolean persistent) {
    this.persistent = persistent;
  }

  public String getUserAgent() {
    return userAgent;
  }

  public void setUserAgent(String userAgent) {
    this.userAgent = userAgent;
  }

  public OffsetDateTime getLastSeenAt() {
    return lastSeenAt;
  }

  public void setLastSeenAt(OffsetDateTime lastSeenAt) {
    this.lastSeenAt = lastSeenAt;
  }

  public OffsetDateTime getRevokedAt() {
    return revokedAt;
  }

  public void setRevokedAt(OffsetDateTime revokedAt) {
    this.revokedAt = revokedAt;
  }
}
