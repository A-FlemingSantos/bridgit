package com.bridgit.api.integrations;

import com.bridgit.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "provider_connections")
public class ProviderConnectionEntity extends BaseEntity {

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(nullable = false, length = 20)
  private String provider;

  @Column(name = "account_id", nullable = false, length = 200)
  private String accountId;

  @Column(name = "account_email", length = 320)
  private String accountEmail;

  @Column(name = "account_name", length = 200)
  private String accountName;

  @Column(length = 1000)
  private String scopes;

  @Column(name = "encrypted_refresh_token", nullable = false, length = 4000)
  private String encryptedRefreshToken;

  @Column(name = "connected_at", nullable = false)
  private OffsetDateTime connectedAt;

  @Column(name = "last_error", length = 120)
  private String lastError;

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

  public String getAccountId() {
    return accountId;
  }

  public void setAccountId(String accountId) {
    this.accountId = accountId;
  }

  public String getAccountEmail() {
    return accountEmail;
  }

  public void setAccountEmail(String accountEmail) {
    this.accountEmail = accountEmail;
  }

  public String getAccountName() {
    return accountName;
  }

  public void setAccountName(String accountName) {
    this.accountName = accountName;
  }

  public String getScopes() {
    return scopes;
  }

  public void setScopes(String scopes) {
    this.scopes = scopes;
  }

  public String getEncryptedRefreshToken() {
    return encryptedRefreshToken;
  }

  public void setEncryptedRefreshToken(String encryptedRefreshToken) {
    this.encryptedRefreshToken = encryptedRefreshToken;
  }

  public OffsetDateTime getConnectedAt() {
    return connectedAt;
  }

  public void setConnectedAt(OffsetDateTime connectedAt) {
    this.connectedAt = connectedAt;
  }

  public String getLastError() {
    return lastError;
  }

  public void setLastError(String lastError) {
    this.lastError = lastError;
  }
}
