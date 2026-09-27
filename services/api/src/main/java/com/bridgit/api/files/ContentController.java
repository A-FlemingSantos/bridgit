package com.bridgit.api.files;

import com.bridgit.api.providers.ContentStream;
import com.bridgit.api.providers.ContentStreamResponder;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/content")
public class ContentController {

  private final ProviderFileService providerFileService;
  private final ContentTicketService contentTicketService;
  private final ContentStreamResponder contentStreamResponder;

  public ContentController(
      ProviderFileService providerFileService,
      ContentTicketService contentTicketService,
      ContentStreamResponder contentStreamResponder
  ) {
    this.providerFileService = providerFileService;
    this.contentTicketService = contentTicketService;
    this.contentStreamResponder = contentStreamResponder;
  }

  @GetMapping("/{ticket}")
  public void streamContent(
      @PathVariable String ticket,
      @RequestHeader(value = "Range", required = false) String range,
      HttpServletResponse response
  ) throws Exception {
    ContentTicketService.ContentTicket parsed = contentTicketService.parseTicket(ticket);
    ContentStream stream = providerFileService.openTicketContent(ticket, range);
    try (stream) {
      contentStreamResponder.write(stream, response, parsed.attachment());
    }
  }
}
