package com.bridgit.api.providers;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

public final class ProviderHttpSupport {

  private ProviderHttpSupport() {
  }

  public static void throwOnError(HttpStatusCode status, String body) {
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
    if (code == 409 || isNameConflict(code, body)) {
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
    if (code == 429 || code >= 500) {
      throw new ProviderApiException(
          "PROVEDOR_FALHOU",
          "O provedor de nuvem falhou ao processar a solicitacao."
      );
    }
    if (code >= 400) {
      throw new ProviderApiException(
          "PROVEDOR_FALHOU",
          "O provedor de nuvem falhou ao processar a solicitacao."
      );
    }
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
