package com.bridgit.api.links;

import com.bridgit.api.common.error.ApiException;
import org.springframework.http.HttpStatus;

/** The file is not reachable right now but may be soon: 503 with an optional Retry-After. */
public class LinkUnavailableException extends ApiException {

  private final Long retryAfterSeconds;

  public LinkUnavailableException(String message, Long retryAfterSeconds) {
    super(HttpStatus.SERVICE_UNAVAILABLE, "LINK_INDISPONIVEL", message);
    this.retryAfterSeconds = retryAfterSeconds;
  }

  @Override
  public Long getRetryAfterSeconds() {
    return retryAfterSeconds;
  }
}
