package com.bridgit.api.links;

import com.bridgit.api.common.error.ApiException;
import com.bridgit.api.common.error.NotFoundException;
import com.bridgit.api.providers.ProviderApiException;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;

/** The single answer of the whole anonymous public-link chain. */
final class PublicLinkErrors {

  static final String LINK_NOT_FOUND_CODE = "LINK_NAO_ENCONTRADO";
  static final String LINK_NOT_FOUND_MESSAGE = "Este link público não está disponível.";
  static final String LINK_UNAVAILABLE_MESSAGE = "O arquivo não está disponível agora. Tente de novo em instantes.";

  private static final Logger logger = LoggerFactory.getLogger(PublicLinkErrors.class);

  private PublicLinkErrors() {
  }

  static NotFoundException linkNotFound() {
    return new NotFoundException(LINK_NOT_FOUND_CODE, LINK_NOT_FOUND_MESSAGE);
  }

  /**
   * What a visitor can do nothing about, or must not learn (missing item, no permission, invalid token,
   * reconnection needed), is a plain 404; only a provider hiccup that may pass (429, 503, 504) says to try
   * again. Anything else is left alone as a server error.
   */
  static RuntimeException publicFailure(RuntimeException ex) {
    if (ex instanceof ProviderApiException providerEx && isTransient(providerEx)) {
      logger.warn("Public link provider failure code={} status={}", providerEx.getCode(), providerEx.getStatus());
      return new LinkUnavailableException(LINK_UNAVAILABLE_MESSAGE, providerEx.getRetryAfterSeconds());
    }
    if (ex instanceof ApiException) {
      return linkNotFound();
    }
    return ex;
  }

  static <T> T publicProviderStep(Supplier<T> step) {
    try {
      return step.get();
    } catch (RuntimeException ex) {
      throw publicFailure(ex);
    }
  }

  static boolean isTransient(ProviderApiException ex) {
    HttpStatus status = ex.getStatus();
    return status == HttpStatus.TOO_MANY_REQUESTS
        || status == HttpStatus.SERVICE_UNAVAILABLE
        || status == HttpStatus.GATEWAY_TIMEOUT
        || "PROVEDOR_INDISPONIVEL".equals(ex.getCode())
        || "PROVEDOR_LIMITADO".equals(ex.getCode());
  }
}
