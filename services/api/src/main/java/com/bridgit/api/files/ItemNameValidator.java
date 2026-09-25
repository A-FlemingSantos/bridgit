package com.bridgit.api.files;

import com.bridgit.api.common.error.BadRequestException;

public final class ItemNameValidator {

  private ItemNameValidator() {
  }

  public static String requireValidName(String name) {
    if (name == null || name.isBlank()) {
      throw new BadRequestException("NOME_INVALIDO", "Informe um nome valido para o item.");
    }
    String trimmed = name.trim();
    if (trimmed.length() > 255) {
      throw new BadRequestException("NOME_INVALIDO", "O nome deve ter no maximo 255 caracteres.");
    }
    if (trimmed.contains("/") || trimmed.contains("\\")) {
      throw new BadRequestException("NOME_INVALIDO", "O nome nao pode conter barras.");
    }
    return trimmed;
  }
}
