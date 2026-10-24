package com.bridgit.api.providers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

public final class ProviderHttpSupport {

  private static final ObjectMapper JSON = new ObjectMapper();

  private static final Pattern ERROR_REASON_PATTERN =
      Pattern.compile("\"reason\"\\s*:\\s*\"([^\"]+)\"");

  private static final Set<String> RATE_LIMIT_REASONS = Set.of(
      "ratelimitexceeded",
      "userratelimitexceeded",
      "activitylimitreached",
      "dailylimitexceeded",
      "quotaexceeded",
      "sharingratelimitexceeded",
      "downloadquotaexceeded"
  );

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
    throwOnError(status, headers, body, provider, false);
  }

  /** Same as {@link #throwOnError(HttpStatusCode, HttpHeaders, String, CloudProvider)} for uploads and other writes. */
  public static void throwOnWriteError(
      HttpStatusCode status,
      HttpHeaders headers,
      String body,
      CloudProvider provider
  ) {
    throwOnError(status, headers, body, provider, true);
  }

  private static void throwOnError(
      HttpStatusCode status,
      HttpHeaders headers,
      String body,
      CloudProvider provider,
      boolean write
  ) {
    int code = status.value();
    if (code == 404) {
      throw new ProviderApiException(
          HttpStatus.NOT_FOUND,
          "ITEM_NAO_ENCONTRADO",
          "Item não encontrado."
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
      Set<String> reasons = body == null ? Set.of() : extractErrorReasons(body);
      if (reasons.contains("exportsizelimitexceeded")) {
        throw conversionTooLarge();
      }
      if (reasons.contains("storagequotaexceeded")) {
        throw insufficientSpace();
      }
      if (isRateLimitBody(body)) {
        throw rateLimited(headers, body);
      }
      throw new ProviderApiException(
          HttpStatus.FORBIDDEN,
          "SEM_PERMISSAO",
          "Sem permissão para esta operação no provedor."
      );
    }
    if (code == 409) {
      if (provider == CloudProvider.DROPBOX) {
        throw dropboxConflict(headers, body);
      }
      throw new ProviderApiException(
          HttpStatus.CONFLICT,
          "ITEM_CONFLITO",
          "Já existe um item com este nome."
      );
    }
    if (isNameConflict(code, body, provider)) {
      throw new ProviderApiException(
          HttpStatus.CONFLICT,
          "ITEM_CONFLITO",
          "Já existe um item com este nome."
      );
    }
    if (code == 413) {
      if (write) {
        throw new ProviderApiException(
            HttpStatus.PAYLOAD_TOO_LARGE,
            "ARQUIVO_GRANDE_DEMAIS",
            "O arquivo é grande demais para o provedor."
        );
      }
      throw conversionTooLarge();
    }
    if (code == 416) {
      throw new ProviderApiException(
          HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE,
          "INTERVALO_INVALIDO",
          "Intervalo solicitado não pode ser atendido."
      );
    }
    if (code == 429) {
      throw rateLimited(headers, body);
    }
    if (code == 507) {
      // OneDrive answers a full account with 507 Insufficient Storage.
      throw insufficientSpace();
    }
    if (code >= 500) {
      throw new ProviderApiException(
          HttpStatus.SERVICE_UNAVAILABLE,
          "PROVEDOR_INDISPONIVEL",
          "O provedor de nuvem está indisponível. Tente novamente em instantes."
      );
    }
    if (code >= 400) {
      throw new ProviderApiException(
          "PROVEDOR_FALHOU",
          "O provedor de nuvem falhou ao processar a solicitação."
      );
    }
  }

  /** The content changed in the cloud since the caller read it (version precondition failed). */
  public static ProviderApiException contentChanged() {
    return new ProviderApiException(
        HttpStatus.CONFLICT,
        "ARQUIVO_ALTERADO",
        "O arquivo foi alterado na nuvem desde que foi aberto."
    );
  }

  /** The provider refuses the write because the file is locked (open in another app). */
  public static ProviderApiException contentLocked() {
    return new ProviderApiException(
        HttpStatus.LOCKED,
        "ARQUIVO_BLOQUEADO",
        "O arquivo está bloqueado no provedor (aberto em outro app)."
    );
  }

  /** True when a Dropbox error body reports a write conflict (stale rev or an existing path). */
  public static boolean isDropboxConflict(String body) {
    return dropboxErrorTags(body).contains("conflict");
  }

  private static ProviderApiException conversionTooLarge() {
    return new ProviderApiException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        "CONVERSAO_GRANDE_DEMAIS",
        "Arquivo grande demais para conversão."
    );
  }

  private static ProviderApiException dropboxConflict(HttpHeaders headers, String body) {
    Set<String> tags = dropboxErrorTags(body);
    if (tags.contains("not_found")) {
      throw new ProviderApiException(
          HttpStatus.NOT_FOUND,
          "ITEM_NAO_ENCONTRADO",
          "Item não encontrado."
      );
    }
    if (tags.contains("insufficient_permissions") || tags.contains("no_write_permission")) {
      throw new ProviderApiException(
          HttpStatus.FORBIDDEN,
          "SEM_PERMISSAO",
          "Sem permissão para esta operação no provedor."
      );
    }
    if (tags.contains("insufficient_space")) {
      throw insufficientSpace();
    }
    if (tags.contains("malformed_path")) {
      throw new ProviderApiException(
          HttpStatus.BAD_REQUEST,
          "NOME_INVALIDO",
          "O nome ou o caminho informado é inválido para o provedor."
      );
    }
    if (tags.contains("too_many_write_operations") || tags.contains("too_many_requests")) {
      throw rateLimited(headers, body);
    }
    if (tags.contains("conflict")) {
      throw new ProviderApiException(
          HttpStatus.CONFLICT,
          "ITEM_CONFLITO",
          "Já existe um item com este nome."
      );
    }
    throw new ProviderApiException(
        "PROVEDOR_FALHOU",
        "O provedor de nuvem falhou ao processar a solicitação."
    );
  }

  /**
   * Collects the error identifiers of a Dropbox error body: the segments of {@code error_summary}
   * and every {@code .tag} value of the {@code error} tree. Falls back to the lowercase word tokens
   * of the body when it is not JSON.
   */
  private static Set<String> dropboxErrorTags(String body) {
    Set<String> tags = new HashSet<>();
    if (body == null || body.isBlank()) {
      return tags;
    }
    JsonNode root = parseJson(body);
    if (root == null || !root.isObject()) {
      for (String token : body.toLowerCase(Locale.ROOT).split("[^a-z0-9_]+")) {
        if (!token.isEmpty()) {
          tags.add(token);
        }
      }
      return tags;
    }
    for (String segment : root.path("error_summary").asText("").toLowerCase(Locale.ROOT).split("/")) {
      if (!segment.isEmpty()) {
        tags.add(segment);
      }
    }
    collectTags(root.path("error"), tags);
    return tags;
  }

  private static void collectTags(JsonNode node, Set<String> tags) {
    if (node.isObject()) {
      JsonNode tag = node.get(".tag");
      if (tag != null && tag.isTextual()) {
        tags.add(tag.asText().toLowerCase(Locale.ROOT));
      }
      node.elements().forEachRemaining(child -> collectTags(child, tags));
    } else if (node.isArray()) {
      node.elements().forEachRemaining(child -> collectTags(child, tags));
    }
  }

  private static JsonNode parseJson(String body) {
    try {
      return JSON.readTree(body);
    } catch (Exception ex) {
      return null;
    }
  }

  private static ProviderApiException insufficientSpace() {
    return new ProviderApiException(
        HttpStatus.INSUFFICIENT_STORAGE,
        "PROVEDOR_SEM_ESPACO",
        "Não há espaço suficiente na conta do provedor."
    );
  }

  private static ProviderApiException rateLimited(HttpHeaders headers, String body) {
    Long retryAfter = parseRetryAfter(headers, Clock.systemUTC());
    if (retryAfter == null) {
      retryAfter = parseBodyRetryAfter(body);
    }
    return new ProviderApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        "PROVEDOR_LIMITADO",
        "O provedor limitou as requisições. Tente novamente em instantes.",
        retryAfter
    );
  }

  static Long parseRetryAfter(HttpHeaders headers) {
    return parseRetryAfter(headers, Clock.systemUTC());
  }

  /** Reads {@code Retry-After} as delay-seconds or as an HTTP date (RFC 1123); dates give at least 1. */
  static Long parseRetryAfter(HttpHeaders headers, Clock clock) {
    if (headers == null) {
      return null;
    }
    String value = headers.getFirst(HttpHeaders.RETRY_AFTER);
    if (value == null || value.isBlank()) {
      return null;
    }
    String trimmed = value.trim();
    try {
      long seconds = Long.parseLong(trimmed);
      return seconds < 0 ? null : seconds;
    } catch (NumberFormatException ex) {
      // not delay-seconds: try an HTTP date
    }
    try {
      ZonedDateTime date = ZonedDateTime.parse(trimmed, DateTimeFormatter.RFC_1123_DATE_TIME);
      Duration wait = Duration.between(clock.instant(), date.toInstant());
      long seconds = wait.getSeconds() + (wait.getNano() > 0 ? 1 : 0);
      return Math.max(1L, seconds);
    } catch (DateTimeParseException ex) {
      return null;
    }
  }

  /** Dropbox may send the delay as {@code error.retry_after} in the JSON body instead of the header. */
  private static Long parseBodyRetryAfter(String body) {
    if (body == null || body.isBlank()) {
      return null;
    }
    JsonNode root = parseJson(body);
    if (root == null) {
      return null;
    }
    JsonNode value = root.path("error").path("retry_after");
    if (!value.isIntegralNumber() || value.asLong() < 0) {
      return null;
    }
    return value.asLong();
  }

  private static boolean isRateLimitBody(String body) {
    if (body == null) {
      return false;
    }
    String lower = body.toLowerCase(Locale.ROOT);
    if (lower.contains("ratelimitexceeded")
        || lower.contains("userratelimitexceeded")
        || lower.contains("activitylimitreached")) {
      return true;
    }
    return extractErrorReasons(body).stream().anyMatch(RATE_LIMIT_REASONS::contains);
  }

  private static Set<String> extractErrorReasons(String body) {
    Set<String> reasons = new HashSet<>();
    Matcher matcher = ERROR_REASON_PATTERN.matcher(body);
    while (matcher.find()) {
      reasons.add(matcher.group(1).toLowerCase(Locale.ROOT));
    }
    return reasons;
  }

  private static boolean isNameConflict(int code, String body, CloudProvider provider) {
    if (code != 400 || body == null || (provider != null && provider != CloudProvider.ONEDRIVE)) {
      return false;
    }
    JsonNode root = parseJson(body);
    if (root == null) {
      return false;
    }
    JsonNode error = root.path("error");
    return "nameAlreadyExists".equalsIgnoreCase(error.path("code").asText(""))
        || "nameAlreadyExists".equalsIgnoreCase(error.path("innererror").path("code").asText(""));
  }
}
