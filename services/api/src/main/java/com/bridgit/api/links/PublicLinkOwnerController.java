package com.bridgit.api.links;

import com.bridgit.api.common.api.ApiEnvelope;
import com.bridgit.api.integrations.ConnectionScope;
import com.bridgit.api.integrations.IfConnected;
import com.bridgit.api.links.LinkDtos.OwnerPublicLink;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping({
    "/api/providers/{provider}/items/{ref}/public-link",
    "/api/connections/{connectionId}/items/{ref}/public-link"
})
public class PublicLinkOwnerController {

  private final PublicLinkService publicLinkService;

  public PublicLinkOwnerController(PublicLinkService publicLinkService) {
    this.publicLinkService = publicLinkService;
  }

  @GetMapping
  public ApiEnvelope<OwnerPublicLink> getPublicLink(
      ConnectionScope scope,
      @PathVariable String ref
  ) {
    return ApiEnvelope.ok(publicLinkService.getOwnerLink(scope, ref));
  }

  @PutMapping
  public ApiEnvelope<OwnerPublicLink> createPublicLink(
      ConnectionScope scope,
      @PathVariable String ref
  ) {
    return ApiEnvelope.ok(publicLinkService.createOrGetOwnerLink(scope, ref));
  }

  @DeleteMapping
  public ApiEnvelope<Void> deletePublicLink(
      @IfConnected ConnectionScope scope,
      @PathVariable String ref
  ) {
    if (scope != null) {
      publicLinkService.deleteOwnerLink(scope, ref);
    }
    return ApiEnvelope.ok(null);
  }
}
