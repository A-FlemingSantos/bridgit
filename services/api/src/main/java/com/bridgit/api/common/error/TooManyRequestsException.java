package com.bridgit.api.common.error;

import org.springframework.http.HttpStatus;

public class TooManyRequestsException extends ApiException {

  private final long retryAfterSeconds;

  public TooManyRequestsException(String code, String message, long retryAfterSeconds) {
    super(HttpStatus.TOO_MANY_REQUESTS, code, message);
    this.retryAfterSeconds = retryAfterSeconds;
  }

  @Override
  public Long getRetryAfterSeconds() {
    return retryAfterSeconds;
  }
}
