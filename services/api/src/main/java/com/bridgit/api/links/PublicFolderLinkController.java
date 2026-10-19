package com.bridgit.api.links;

import com.bridgit.api.common.api.ApiEnvelope;
import com.bridgit.api.links.LinkDtos.PublicLinkMetadata;
import com.bridgit.api.links.PublicFolderDtos.PublicFolderListing;
import jakarta.servlet.http.HttpServletRequest;
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

/** Anonymous browsing of a shared folder: listing, child metadata and child content. */
@RestController
@Validated
@RequestMapping("/api/public/links/{linkRef}/items")
public class PublicFolderLinkController {

  private static final String NO_INDEX = "noindex, nofollow";

  private final PublicFolderLinkService folderLinkService;

  PublicFolderLinkController(PublicFolderLinkService folderLinkService) {
    this.folderLinkService = folderLinkService;
  }

  @GetMapping
  public ResponseEntity<ApiEnvelope<PublicFolderListing>> list(
      @PathVariable String linkRef,
      @RequestParam(required = false) String folder,
      @RequestParam(required = false) String cursor,
      HttpServletRequest request
  ) {
    return ResponseEntity.ok()
        .header("X-Robots-Tag", NO_INDEX)
        .body(ApiEnvelope.ok(folderLinkService.list(linkRef, folder, cursor, request.getRemoteAddr())));
  }

  @GetMapping("/{itemRef}")
  public ResponseEntity<ApiEnvelope<PublicLinkMetadata>> getItem(
      @PathVariable String linkRef,
      @PathVariable String itemRef,
      HttpServletRequest request
  ) {
    return ResponseEntity.ok()
        .header("X-Robots-Tag", NO_INDEX)
        .body(ApiEnvelope.ok(folderLinkService.itemMetadata(linkRef, itemRef, request.getRemoteAddr())));
  }

  @GetMapping("/{itemRef}/content")
  public void streamContent(
      @PathVariable String linkRef,
      @PathVariable String itemRef,
      @RequestParam(required = false) String variant,
      @RequestHeader(value = "Range", required = false) String range,
      HttpServletRequest request,
      HttpServletResponse response
  ) throws IOException {
    response.setHeader("X-Robots-Tag", NO_INDEX);
    folderLinkService.streamItemContent(linkRef, itemRef, variant, range, request.getRemoteAddr(), response);
  }
}
