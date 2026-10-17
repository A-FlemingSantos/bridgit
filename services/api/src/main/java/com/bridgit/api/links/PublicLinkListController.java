package com.bridgit.api.links;

import com.bridgit.api.common.api.ApiEnvelope;
import com.bridgit.api.links.LinkDtos.OwnerPublicLinkSummary;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/hub/public-links")
public class PublicLinkListController {

  private final PublicLinkService publicLinkService;

  public PublicLinkListController(PublicLinkService publicLinkService) {
    this.publicLinkService = publicLinkService;
  }

  @GetMapping
  public ApiEnvelope<List<OwnerPublicLinkSummary>> listPublicLinks() {
    return ApiEnvelope.ok(publicLinkService.listOwnerLinks());
  }
}
