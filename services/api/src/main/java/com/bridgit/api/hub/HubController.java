package com.bridgit.api.hub;

import com.bridgit.api.common.api.ApiEnvelope;
import com.bridgit.api.hub.HubDtos.AddRecentRequest;
import com.bridgit.api.hub.HubDtos.HubEntry;
import com.bridgit.api.providers.CloudProvider;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/hub")
public class HubController {

  private final HubService hubService;

  public HubController(HubService hubService) {
    this.hubService = hubService;
  }

  @GetMapping("/recents")
  public ApiEnvelope<List<HubEntry>> listRecents() {
    return ApiEnvelope.ok(hubService.listRecents());
  }

  @PostMapping("/recents")
  public ApiEnvelope<HubEntry> addRecent(@Valid @RequestBody AddRecentRequest request) {
    return ApiEnvelope.ok(hubService.addRecent(request.provider(), request.ref()));
  }

  @GetMapping("/shortcuts")
  public ApiEnvelope<List<HubEntry>> listShortcuts() {
    return ApiEnvelope.ok(hubService.listShortcuts());
  }

  @PutMapping("/shortcuts/{provider}/{ref}")
  public ApiEnvelope<HubEntry> upsertShortcut(
      @PathVariable CloudProvider provider,
      @PathVariable String ref
  ) {
    return ApiEnvelope.ok(hubService.upsertShortcut(provider, ref));
  }

  @DeleteMapping("/shortcuts/{provider}/{ref}")
  public ApiEnvelope<Void> deleteShortcut(
      @PathVariable CloudProvider provider,
      @PathVariable String ref
  ) {
    hubService.deleteShortcut(provider, ref);
    return ApiEnvelope.ok(null);
  }
}
