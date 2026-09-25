package com.bridgit.api.files;

import com.bridgit.api.common.api.ApiEnvelope;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/search")
public class SearchController {

  private final SearchService searchService;

  public SearchController(SearchService searchService) {
    this.searchService = searchService;
  }

  @GetMapping
  public ApiEnvelope<FilesDtos.SearchResponse> search(@RequestParam("q") String query) {
    return ApiEnvelope.ok(searchService.search(query));
  }
}
