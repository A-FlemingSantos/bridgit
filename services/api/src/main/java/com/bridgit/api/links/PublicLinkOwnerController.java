package com.bridgit.api.links;

import com.bridgit.api.common.api.ApiEnvelope;
import com.bridgit.api.links.LinkDtos.OwnerPublicLinkResponse;
import com.bridgit.api.providers.CloudProvider;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/providers/{provider}/items/{ref}/public-link")
public class PublicLinkOwnerController {

  private final PublicLinkService publicLinkService;

  public PublicLinkOwnerController(PublicLinkService publicLinkService) {
    this.publicLinkService = publicLinkService;
  }

  @GetMapping
  public ApiEnvelope<OwnerPublicLinkResponse> getPublicLink(
      @PathVariable CloudProvider provider,
      @PathVariable String ref
  ) {
    return ApiEnvelope.ok(publicLinkService.getOwnerLink(provider, ref));
  }

  @PutMapping
  public ApiEnvelope<OwnerPublicLinkResponse> createPublicLink(
      @PathVariable CloudProvider provider,
      @PathVariable String ref
  ) {
    return ApiEnvelope.ok(publicLinkService.createOrGetOwnerLink(provider, ref));
  }

  @DeleteMapping
  public ApiEnvelope<Void> deletePublicLink(
      @PathVariable CloudProvider provider,
      @PathVariable String ref
  ) {
    publicLinkService.deleteOwnerLink(provider, ref);
    return ApiEnvelope.ok(null);
  }
}
