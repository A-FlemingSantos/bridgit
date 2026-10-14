package com.bridgit.api.auth;

import com.bridgit.api.common.error.BadRequestException;
import java.util.Locale;
import java.util.regex.Pattern;

public final class UsernameRules {

  private static final Pattern USERNAME_PATTERN = Pattern.compile("^[A-Za-z0-9._-]{3,32}$");

  private UsernameRules() {
  }

  public static String normalizeUsername(String username) {
    String normalized = username == null ? "" : username.trim();
    if (normalized.isBlank()) {
      throw new BadRequestException("USUARIO_OBRIGATORIO", "O usuário é obrigatório.");
    }
    if (!USERNAME_PATTERN.matcher(normalized).matches()) {
      throw new BadRequestException(
          "USUARIO_INVALIDO",
          "O usuário deve ter entre 3 e 32 caracteres e usar apenas letras, números, ponto, hífen ou sublinhado."
      );
    }
    return normalized;
  }

  public static String usernameKey(String username) {
    return normalizeUsername(username).toLowerCase(Locale.ROOT);
  }
}
