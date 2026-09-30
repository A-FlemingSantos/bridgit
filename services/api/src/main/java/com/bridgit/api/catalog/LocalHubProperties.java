package com.bridgit.api.catalog;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app.hub")
public class LocalHubProperties {
  private boolean catalogEnabled = true;
  private boolean operationsEnabled = true;
  private boolean workerEnabled = true;
  private boolean directReadEnabled = true;
  private boolean contentCacheEnabled = true;
  public boolean isContentCacheEnabled() { return contentCacheEnabled; }
  public void setContentCacheEnabled(boolean enabled) { contentCacheEnabled = enabled; }
  private String webhookBaseUrl = "";
  private String uploadDirectory = "./data/pending-uploads";
  private long uploadGlobalBytes = 5L * 1024 * 1024 * 1024;
  private long uploadUserBytes = 500L * 1024 * 1024;
  private java.util.Set<String> disabledProviders = java.util.Set.of();
  public java.util.Set<String> getDisabledProviders() { return disabledProviders; }
  public void setDisabledProviders(java.util.Set<String> providers) { disabledProviders = java.util.Set.copyOf(providers); }
  public boolean providerEnabled(String provider) { return !disabledProviders.contains(provider); }
  public boolean isCatalogEnabled() { return catalogEnabled; }
  public void setCatalogEnabled(boolean value) { catalogEnabled = value; }
  public boolean isOperationsEnabled() { return operationsEnabled; }
  public void setOperationsEnabled(boolean value) { operationsEnabled = value; }
  public boolean isWorkerEnabled() { return workerEnabled; }
  public void setWorkerEnabled(boolean value) { workerEnabled = value; }
  public boolean isDirectReadEnabled() { return directReadEnabled; }
  public void setDirectReadEnabled(boolean value) { directReadEnabled = value; }
  public String getWebhookBaseUrl() { return webhookBaseUrl; }
  public void setWebhookBaseUrl(String value) { webhookBaseUrl = value; }
  public String getUploadDirectory() { return uploadDirectory; }
  public void setUploadDirectory(String value) { uploadDirectory = value; }
  public long getUploadGlobalBytes() { return uploadGlobalBytes; }
  public void setUploadGlobalBytes(long value) { uploadGlobalBytes = value; }
  public long getUploadUserBytes() { return uploadUserBytes; }
  public void setUploadUserBytes(long value) { uploadUserBytes = value; }
}
