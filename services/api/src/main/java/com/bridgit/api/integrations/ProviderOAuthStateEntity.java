package com.bridgit.api.integrations;

import com.bridgit.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "provider_oauth_states")
public class ProviderOAuthStateEntity extends BaseEntity {

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(nullable = false, length = 20)
  private String provider;

  @Column(name = "state_token", nullable = false, length = 120, unique = true)
  private String stateToken;

  @Column(name = "code_verifier", nullable = false, length = 200)
  private String codeVerifier;

  @Column(name = "redirect_path", length = 500)
  private String redirectPath;

  @Column(name = "expires_at", nullable = false)
  private OffsetDateTime expiresAt;

  @Column(name = "used_at")
  private OffsetDateTime usedAt;

  public UUID getUserId() {
    return userId;
  }

  public void setUserId(UUID userId) {
    this.userId = userId;
  }

  public String getProvider() {
    return provider;
  }

  public void setProvider(String provider) {
    this.provider = provider;
  }

  public String getStateToken() {
    return stateToken;
  }

  public void setStateToken(String stateToken) {
    this.stateToken = stateToken;
  }

  public String getCodeVerifier() {
    return codeVerifier;
  }

  public void setCodeVerifier(String codeVerifier) {
    this.codeVerifier = codeVerifier;
  }

  public String getRedirectPath() {
    return redirectPath;
  }

  public void setRedirectPath(String redirectPath) {
    this.redirectPath = redirectPath;
  }

  public OffsetDateTime getExpiresAt() {
    return expiresAt;
  }

  public void setExpiresAt(OffsetDateTime expiresAt) {
    this.expiresAt = expiresAt;
  }

  public OffsetDateTime getUsedAt() {
    return usedAt;
  }

  public void setUsedAt(OffsetDateTime usedAt) {
    this.usedAt = usedAt;
  }
}
