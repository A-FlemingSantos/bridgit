package com.bridgit.api.providers;

import com.bridgit.api.common.error.ApiException;
import org.springframework.http.HttpStatus;

public class ProviderApiException extends ApiException {

  private final Long retryAfterSeconds;

  public ProviderApiException(String message) {
    this("PROVEDOR_FALHOU", message);
  }

  public ProviderApiException(String code, String message) {
    this(HttpStatus.BAD_GATEWAY, code, message);
  }

  public ProviderApiException(HttpStatus status, String code, String message) {
    this(status, code, message, null);
  }

  public ProviderApiException(HttpStatus status, String code, String message, Long retryAfterSeconds) {
    super(status, code, message);
    this.retryAfterSeconds = retryAfterSeconds;
  }

  public Long getRetryAfterSeconds() {
    return retryAfterSeconds;
  }
}
