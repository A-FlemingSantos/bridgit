package com.bridgit.api.config;

import java.util.Arrays;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.core.env.Environment;

public final class DatasourceSafetyGuard {

  private static final Pattern DATABASE_NAME_PATTERN = Pattern.compile("(?i)(?:^|;)databaseName=([^;]+)");
  private static final String OFFICIAL_DATABASE = "bridgit_db";

  private DatasourceSafetyGuard() {
  }

  public static void validate(Environment environment) {
    if (isTestProfile(environment)) {
      return;
    }

    String datasourceUrl = environment.getProperty("spring.datasource.url", "");
    String databaseName = extractDatabaseName(datasourceUrl);

    if (databaseName == null || databaseName.isBlank()) {
      throw new IllegalStateException(
          "Inicializacao bloqueada: fora do profile de teste, o datasource deve informar o parametro 'databaseName' e usar exclusivamente a base oficial da aplicacao."
      );
    }

    String normalizedDatabaseName = databaseName.trim().toLowerCase(Locale.ROOT);
    if (OFFICIAL_DATABASE.equals(normalizedDatabaseName)) {
      return;
    }

    throw new IllegalStateException(
        "Inicializacao bloqueada: fora do profile de teste, o backend deve usar exclusivamente a base '"
            + OFFICIAL_DATABASE
            + "'. Base recebida: '"
            + databaseName
            + "'."
    );
  }

  public static String extractDatabaseName(String datasourceUrl) {
    if (datasourceUrl == null || datasourceUrl.isBlank()) {
      return null;
    }

    Matcher matcher = DATABASE_NAME_PATTERN.matcher(datasourceUrl);
    if (!matcher.find()) {
      return null;
    }

    return matcher.group(1);
  }

  private static boolean isTestProfile(Environment environment) {
    return Arrays.stream(environment.getActiveProfiles())
        .map(profile -> profile.toLowerCase(Locale.ROOT))
        .anyMatch("test"::equals);
  }
}
