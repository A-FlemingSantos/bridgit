package com.bridgit.api.integrations;

import com.bridgit.api.common.api.ApiEnvelope;
import com.bridgit.api.providers.CloudProvider;
import java.net.URI;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/providers")
public class ProviderController {

  private final ProviderConnectionService providerConnectionService;

  public ProviderController(ProviderConnectionService providerConnectionService) {
    this.providerConnectionService = providerConnectionService;
  }

  @GetMapping
  public ApiEnvelope<List<ProviderConnectionDtos.ProviderStatus>> list() {
    return ApiEnvelope.ok(providerConnectionService.listForCurrentUser());
  }

  @PostMapping("/{provider}/connect")
  public ApiEnvelope<ProviderConnectionDtos.AuthorizationResponse> connect(
      @PathVariable CloudProvider provider,
      @RequestBody(required = false) ProviderConnectionDtos.ConnectRequest request
  ) {
    String redirectTo = request == null ? null : request.redirectTo();
    String authorizationUrl = providerConnectionService.startAuthorization(provider, redirectTo);
    return ApiEnvelope.ok(new ProviderConnectionDtos.AuthorizationResponse(authorizationUrl));
  }

  @GetMapping("/{provider}/callback")
  public ResponseEntity<Void> callback(
      @PathVariable CloudProvider provider,
      @RequestParam(required = false) String state,
      @RequestParam(required = false) String code,
      @RequestParam(required = false) String error
  ) {
    URI location = providerConnectionService.completeCallback(provider, state, code, error);
    return ResponseEntity.status(HttpStatus.FOUND)
        .header(HttpHeaders.LOCATION, location.toString())
        .build();
  }

  @DeleteMapping("/{provider}")
  public ApiEnvelope<List<ProviderConnectionDtos.ProviderStatus>> disconnect(
      @PathVariable CloudProvider provider
  ) {
    return ApiEnvelope.ok(providerConnectionService.disconnect(provider));
  }
}
