package com.bridgit.api.auth;

import com.bridgit.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "users")
public class UserEntity extends BaseEntity {

  @Column(nullable = false, length = 32)
  private String username;

  @Column(name = "username_key", nullable = false, unique = true, length = 32)
  private String usernameKey;

  @Column(name = "password_hash", nullable = false, length = 255)
  private String passwordHash;

  public String getUsername() {
    return username;
  }

  public void setUsername(String username) {
    this.username = username;
  }

  public String getUsernameKey() {
    return usernameKey;
  }

  public void setUsernameKey(String usernameKey) {
    this.usernameKey = usernameKey;
  }

  public String getPasswordHash() {
    return passwordHash;
  }

  public void setPasswordHash(String passwordHash) {
    this.passwordHash = passwordHash;
  }
}
