package com.bridgit.api.integrations;

import com.bridgit.api.common.api.ApiEnvelope;
import java.util.List;
import java.util.UUID;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Routes keyed by one connected account, as opposed to the provider-keyed {@link ProviderController}. */
@RestController
@Validated
@RequestMapping("/api/connections")
public class ConnectionController {

  private final ProviderConnectionService providerConnectionService;

  public ConnectionController(ProviderConnectionService providerConnectionService) {
    this.providerConnectionService = providerConnectionService;
  }

  @DeleteMapping("/{connectionId}")
  public ApiEnvelope<List<ProviderConnectionDtos.ProviderStatus>> disconnect(
      @PathVariable UUID connectionId
  ) {
    return ApiEnvelope.ok(providerConnectionService.disconnect(connectionId));
  }
}
