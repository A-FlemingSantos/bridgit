package com.bridgit.api.links;

import com.bridgit.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "public_links")
public class PublicLinkEntity extends BaseEntity {

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "connection_id", nullable = false)
  private UUID connectionId;

  @Column(name = "item_ref", nullable = false, length = 400)
  private String itemRef;

  @Column(nullable = false, length = 32, unique = true)
  private String suffix;

  @Column(nullable = false, length = 120)
  private String slug;

  @Column(nullable = false, length = 400)
  private String name;

  @Column(name = "mime_type", length = 200)
  private String mimeType;

  @Column(length = 40)
  private String extension;

  @Column
  private Long size;

  @Column(name = "last_accessed_at")
  private OffsetDateTime lastAccessedAt;

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

  public String getSuffix() {
    return suffix;
  }

  public void setSuffix(String suffix) {
    this.suffix = suffix;
  }

  public String getSlug() {
    return slug;
  }

  public void setSlug(String slug) {
    this.slug = slug;
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

  public Long getSize() {
    return size;
  }

  public void setSize(Long size) {
    this.size = size;
  }

  public OffsetDateTime getLastAccessedAt() {
    return lastAccessedAt;
  }

  public void setLastAccessedAt(OffsetDateTime lastAccessedAt) {
    this.lastAccessedAt = lastAccessedAt;
  }
}
