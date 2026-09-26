package com.bridgit.api.providers;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

public final class ProviderHttpSupport {

  private ProviderHttpSupport() {
  }

  public static void throwOnError(HttpStatusCode status, String body) {
    throwOnError(status, HttpHeaders.EMPTY, body, null);
  }

  public static void throwOnError(HttpStatusCode status, HttpHeaders headers, String body) {
    throwOnError(status, headers, body, null);
  }

  public static void throwOnError(HttpStatusCode status, String body, CloudProvider provider) {
    throwOnError(status, HttpHeaders.EMPTY, body, provider);
  }

  public static void throwOnError(
      HttpStatusCode status,
      HttpHeaders headers,
      String body,
      CloudProvider provider
  ) {
    int code = status.value();
    if (code == 404) {
      throw new ProviderApiException(
          HttpStatus.NOT_FOUND,
          "ITEM_NAO_ENCONTRADO",
          "Item nao encontrado."
      );
    }
    if (code == 401) {
      throw new ProviderApiException(
          HttpStatus.UNAUTHORIZED,
          "TOKEN_PROVEDOR_INVALIDO",
          "Token do provedor expirou."
      );
    }
    if (code == 403) {
      if (isRateLimitBody(body)) {
        throw rateLimited(headers);
      }
      throw new ProviderApiException(
          HttpStatus.FORBIDDEN,
          "SEM_PERMISSAO",
          "Sem permissao para esta operacao no provedor."
      );
    }
    if (code == 409) {
      if (provider == CloudProvider.DROPBOX) {
        throw dropboxConflict(body);
      }
      throw new ProviderApiException(
          HttpStatus.CONFLICT,
          "ITEM_CONFLITO",
          "Ja existe um item com este nome."
      );
    }
    if (isNameConflict(code, body)) {
      throw new ProviderApiException(
          HttpStatus.CONFLICT,
          "ITEM_CONFLITO",
          "Ja existe um item com este nome."
      );
    }
    if (code == 413) {
      throw new ProviderApiException(
          HttpStatus.PAYLOAD_TOO_LARGE,
          "CONVERSAO_GRANDE_DEMAIS",
          "Arquivo grande demais para conversao."
      );
    }
    if (code == 416) {
      throw new ProviderApiException(
          HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE,
          "INTERVALO_INVALIDO",
          "Intervalo solicitado nao pode ser atendido."
      );
    }
    if (code == 429) {
      throw rateLimited(headers);
    }
    if (code >= 500) {
      throw new ProviderApiException(
          HttpStatus.SERVICE_UNAVAILABLE,
          "PROVEDOR_INDISPONIVEL",
          "O provedor de nuvem esta indisponivel. Tente novamente em instantes."
      );
    }
    if (code >= 400) {
      throw new ProviderApiException(
          "PROVEDOR_FALHOU",
          "O provedor de nuvem falhou ao processar a solicitacao."
      );
    }
  }

  private static ProviderApiException dropboxConflict(String body) {
    String lower = body == null ? "" : body.toLowerCase();
    if (lower.contains("not_found")) {
      throw new ProviderApiException(
          HttpStatus.NOT_FOUND,
          "ITEM_NAO_ENCONTRADO",
          "Item nao encontrado."
      );
    }
    if (lower.contains("insufficient_permissions") || lower.contains("no_write_permission")) {
      throw new ProviderApiException(
          HttpStatus.FORBIDDEN,
          "SEM_PERMISSAO",
          "Sem permissao para esta operacao no provedor."
      );
    }
    if (lower.contains("too_many_write_operations")) {
      throw rateLimited(HttpHeaders.EMPTY);
    }
    if (lower.contains("conflict")) {
      throw new ProviderApiException(
          HttpStatus.CONFLICT,
          "ITEM_CONFLITO",
          "Ja existe um item com este nome."
      );
    }
    throw new ProviderApiException(
        "PROVEDOR_FALHOU",
        "O provedor de nuvem falhou ao processar a solicitacao."
    );
  }

  private static ProviderApiException rateLimited(HttpHeaders headers) {
    return new ProviderApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        "PROVEDOR_LIMITADO",
        "O provedor limitou as requisicoes. Tente novamente em instantes.",
        parseRetryAfter(headers)
    );
  }

  static Long parseRetryAfter(HttpHeaders headers) {
    if (headers == null) {
      return null;
    }
    String value = headers.getFirst(HttpHeaders.RETRY_AFTER);
    if (value == null || value.isBlank()) {
      return null;
    }
    try {
      long seconds = Long.parseLong(value.trim());
      return seconds < 0 ? null : seconds;
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private static boolean isRateLimitBody(String body) {
    if (body == null) {
      return false;
    }
    String lower = body.toLowerCase();
    return lower.contains("ratelimitexceeded")
        || lower.contains("userratelimitexceeded")
        || lower.contains("activitylimitreached");
  }

  private static boolean isNameConflict(int code, String body) {
    if (body == null) {
      return false;
    }
    String lower = body.toLowerCase();
    return code == 400 && (lower.contains("namealreadyexists")
        || lower.contains("conflict")
        || lower.contains("already exists"));
  }
}
