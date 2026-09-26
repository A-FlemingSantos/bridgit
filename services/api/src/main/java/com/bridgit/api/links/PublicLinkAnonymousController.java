package com.bridgit.api.links;

import com.bridgit.api.common.api.ApiEnvelope;
import com.bridgit.api.links.LinkDtos.PublicLinkMetadata;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/public/links")
public class PublicLinkAnonymousController {

  private static final String NO_INDEX = "noindex, nofollow";

  private final PublicLinkService publicLinkService;

  public PublicLinkAnonymousController(PublicLinkService publicLinkService) {
    this.publicLinkService = publicLinkService;
  }

  @GetMapping("/{suffix}")
  public ResponseEntity<ApiEnvelope<PublicLinkMetadata>> getMetadata(@PathVariable String suffix) {
    return ResponseEntity.ok()
        .header("X-Robots-Tag", NO_INDEX)
        .body(ApiEnvelope.ok(publicLinkService.getPublicMetadata(suffix)));
  }

  @GetMapping("/{suffix}/content")
  public void streamContent(
      @PathVariable String suffix,
      @RequestParam(required = false) String variant,
      @RequestHeader(value = "Range", required = false) String range,
      HttpServletResponse response
  ) throws IOException {
    response.setHeader("X-Robots-Tag", NO_INDEX);
    publicLinkService.streamPublicContent(suffix, variant, range, response);
  }
}
