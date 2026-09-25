package com.bridgit.api.hub;

import com.bridgit.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "hub_shortcuts")
public class HubShortcutEntity extends BaseEntity {

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "connection_id", nullable = false)
  private UUID connectionId;

  @Column(name = "item_ref", nullable = false, length = 400)
  private String itemRef;

  @Column(nullable = false, length = 400)
  private String name;

  @Column(name = "mime_type", length = 200)
  private String mimeType;

  @Column(length = 40)
  private String extension;

  @Column(name = "pinned_at", nullable = false)
  private OffsetDateTime pinnedAt;

  public UUID getUserId() {
    return userId;
  }

  public void setUserId(UUID userId) {
    this.userId = userId;
  }

  public UUID getConnectionId() {
    return connectionId;
  }

  public void setConnectionId(UUID connectionId) {
    this.connectionId = connectionId;
  }

  public String getItemRef() {
    return itemRef;
  }

  public void setItemRef(String itemRef) {
    this.itemRef = itemRef;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getMimeType() {
    return mimeType;
  }

  public void setMimeType(String mimeType) {
    this.mimeType = mimeType;
  }

  public String getExtension() {
    return extension;
  }

  public void setExtension(String extension) {
    this.extension = extension;
  }

  public OffsetDateTime getPinnedAt() {
    return pinnedAt;
  }

  public void setPinnedAt(OffsetDateTime pinnedAt) {
    this.pinnedAt = pinnedAt;
  }
}
