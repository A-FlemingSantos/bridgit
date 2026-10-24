package com.bridgit.api.hub;

import com.bridgit.api.providers.CloudProvider;
import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.AssertTrue;
import java.time.OffsetDateTime;
import java.util.UUID;

public final class HubDtos {

  private HubDtos() {
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record HubEntry(
      String provider,
      UUID connectionId,
      String ref,
      String name,
      String mimeType,
      String extension,
      OffsetDateTime openedAt,
      OffsetDateTime pinnedAt,
      String contentRevision,
      String remoteVersion
  ) {
  }

  // `connectionId` wins over `provider`; a provider alone means its oldest connection.
  public record AddRecentRequest(
      UUID connectionId,
      CloudProvider provider,
      @NotBlank(message = "A referência do item é obrigatória.") String ref
  ) {

    @JsonIgnore
    @AssertTrue(message = "Informe a conexão ou o provedor.")
    public boolean isTargetPresent() {
      return connectionId != null || provider != null;
    }
  }
}
