package com.bridgit.api.hub;

import com.bridgit.api.common.api.ApiEnvelope;
import com.bridgit.api.hub.HubDtos.AddRecentRequest;
import com.bridgit.api.hub.HubDtos.HubEntry;
import com.bridgit.api.integrations.ConnectionScope;
import com.bridgit.api.integrations.IfConnected;
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
@RequestMapping("/api")
public class HubController {

  private final HubService hubService;

  public HubController(HubService hubService) {
    this.hubService = hubService;
  }

  @GetMapping("/hub/recents")
  public ApiEnvelope<List<HubEntry>> listRecents() {
    return ApiEnvelope.ok(hubService.listRecents());
  }

  @PostMapping("/hub/recents")
  public ApiEnvelope<HubEntry> addRecent(@Valid @RequestBody AddRecentRequest request) {
    return ApiEnvelope.ok(hubService.addRecent(request.connectionId(), request.provider(), request.ref()));
  }

  @GetMapping("/hub/shortcuts")
  public ApiEnvelope<List<HubEntry>> listShortcuts() {
    return ApiEnvelope.ok(hubService.listShortcuts());
  }

  @PutMapping({"/hub/shortcuts/{provider}/{ref}", "/connections/{connectionId}/items/{ref}/shortcut"})
  public ApiEnvelope<HubEntry> upsertShortcut(
      ConnectionScope scope,
      @PathVariable String ref
  ) {
    return ApiEnvelope.ok(hubService.upsertShortcut(scope, ref));
  }

  @DeleteMapping({"/hub/shortcuts/{provider}/{ref}", "/connections/{connectionId}/items/{ref}/shortcut"})
  public ApiEnvelope<Void> deleteShortcut(
      @IfConnected ConnectionScope scope,
      @PathVariable String ref
  ) {
    if (scope != null) {
      hubService.deleteShortcut(scope, ref);
    }
    return ApiEnvelope.ok(null);
  }
}
