package com.bridgit.api.providers;

import com.bridgit.api.common.error.ApiException;
import org.springframework.http.HttpStatus;

public class ProviderApiException extends ApiException {

  public ProviderApiException(String message) {
    this("PROVEDOR_FALHOU", message);
  }

  public ProviderApiException(String code, String message) {
    this(HttpStatus.BAD_GATEWAY, code, message);
  }

  public ProviderApiException(HttpStatus status, String code, String message) {
    super(status, code, message);
  }
}
