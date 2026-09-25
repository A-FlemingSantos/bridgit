package com.bridgit.api.integrations;

import com.bridgit.api.providers.CloudProvider;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.providers")
public class CloudProvidersProperties {

  private int stateMinutes = 10;
  private ProviderCredentials onedrive = new ProviderCredentials();
  private ProviderCredentials googleDrive = new ProviderCredentials();
  private ProviderCredentials dropbox = new ProviderCredentials();

  public int getStateMinutes() {
    return stateMinutes;
  }

  public void setStateMinutes(int stateMinutes) {
    this.stateMinutes = stateMinutes;
  }

  public ProviderCredentials getOnedrive() {
    return onedrive;
  }

  public void setOnedrive(ProviderCredentials onedrive) {
    this.onedrive = onedrive;
  }

  public ProviderCredentials getGoogleDrive() {
    return googleDrive;
  }

  public void setGoogleDrive(ProviderCredentials googleDrive) {
    this.googleDrive = googleDrive;
  }

  public ProviderCredentials getDropbox() {
    return dropbox;
  }

  public void setDropbox(ProviderCredentials dropbox) {
    this.dropbox = dropbox;
  }

  public ProviderCredentials forProvider(CloudProvider provider) {
    return switch (provider) {
      case ONEDRIVE -> onedrive;
      case GOOGLE_DRIVE -> googleDrive;
      case DROPBOX -> dropbox;
    };
  }

  public static class ProviderCredentials {

    private String clientId = "";
    private String clientSecret = "";
    private String redirectUri = "";

    public String getClientId() {
      return clientId;
    }

    public void setClientId(String clientId) {
      this.clientId = clientId;
    }

    public String getClientSecret() {
      return clientSecret;
    }

    public void setClientSecret(String clientSecret) {
      this.clientSecret = clientSecret;
    }

    public String redirectUri() {
      return redirectUri;
    }

    public String getRedirectUri() {
      return redirectUri;
    }

    public void setRedirectUri(String redirectUri) {
      this.redirectUri = redirectUri;
    }

    public boolean configured() {
      return clientId != null && !clientId.isBlank()
          && clientSecret != null && !clientSecret.isBlank();
    }
  }
}
