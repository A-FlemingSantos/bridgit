package com.bridgit.api.hub;

import com.bridgit.api.providers.CloudProvider;
import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.OffsetDateTime;

public final class HubDtos {

  private HubDtos() {
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record HubEntry(
      String provider,
      String ref,
      String name,
      String mimeType,
      String extension,
      OffsetDateTime openedAt,
      OffsetDateTime pinnedAt
  ) {
  }

  public record AddRecentRequest(
      @NotNull(message = "O provedor e obrigatorio.") CloudProvider provider,
      @NotBlank(message = "A referencia do item e obrigatoria.") String ref
  ) {
  }
}
