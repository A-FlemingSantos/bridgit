package com.bridgit.api.providers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

class ProviderHttpSupportTest {

  @Test
  void maps404ToItemNotFound() {
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.NOT_FOUND, "")
    );
    assertEquals("ITEM_NAO_ENCONTRADO", ex.getCode());
    assertEquals(HttpStatus.NOT_FOUND, ex.getStatus());
  }

  @Test
  void provider401KeepsInternalUnauthorizedMarker() {
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.UNAUTHORIZED, "")
    );
    assertEquals("TOKEN_PROVEDOR_INVALIDO", ex.getCode());
    assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatus());
  }

  @Test
  void maps409ToConflict() {
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.CONFLICT, "")
    );
    assertEquals("ITEM_CONFLITO", ex.getCode());
  }

  @Test
  void maps429ToRateLimitedWithRetryAfter() {
    HttpHeaders headers = new HttpHeaders();
    headers.set(HttpHeaders.RETRY_AFTER, "12");
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.TOO_MANY_REQUESTS, headers, "")
    );
    assertEquals("PROVEDOR_LIMITADO", ex.getCode());
    assertEquals(HttpStatus.TOO_MANY_REQUESTS, ex.getStatus());
    assertEquals(12L, ex.getRetryAfterSeconds());
  }

  @Test
  void maps5xxToUnavailable() {
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.BAD_GATEWAY, "")
    );
    assertEquals("PROVEDOR_INDISPONIVEL", ex.getCode());
    assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatus());
  }

  @ParameterizedTest
  @CsvSource({
      "'{\"error_summary\": \"path/not_found/abc\"}', ITEM_NAO_ENCONTRADO, NOT_FOUND",
      "'{\"error\": {\".tag\": \"path\", \"path\": {\".tag\": \"not_found\"}}}', ITEM_NAO_ENCONTRADO, NOT_FOUND",
      "'{\"error_summary\": \"path/conflict/file/abc\"}', ITEM_CONFLITO, CONFLICT",
      "'{\"error_summary\": \"too_many_write_operations/abc\"}', PROVEDOR_LIMITADO, TOO_MANY_REQUESTS",
      "'{\"error_summary\": \"no_write_permission/abc\"}', SEM_PERMISSAO, FORBIDDEN",
      "'{\"error_summary\": \"insufficient_permissions/abc\"}', SEM_PERMISSAO, FORBIDDEN",
      "'{\"error_summary\": \"other/abc\"}', PROVEDOR_FALHOU, BAD_GATEWAY"
  })
  void dropbox409InterpretsErrorSummary(String body, String code, HttpStatus status) {
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.CONFLICT, body, CloudProvider.DROPBOX)
    );
    assertEquals(code, ex.getCode());
    assertEquals(status, ex.getStatus());
  }

  @ParameterizedTest
  @CsvSource({
      "'{\"error\": {\"code\": \"rateLimitExceeded\"}}', PROVEDOR_LIMITADO, TOO_MANY_REQUESTS",
      "'{\"error\": {\"message\": \"userRateLimitExceeded\"}}', PROVEDOR_LIMITADO, TOO_MANY_REQUESTS",
      "'{\"error\": {\"code\": \"activityLimitReached\"}}', PROVEDOR_LIMITADO, TOO_MANY_REQUESTS",
      "'{\"error\": {\"code\": \"accessDenied\"}}', SEM_PERMISSAO, FORBIDDEN"
  })
  void graphAndDrive403DistinguishRateLimit(String body, String code, HttpStatus status) {
    ProviderApiException graph = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.FORBIDDEN, body, CloudProvider.ONEDRIVE)
    );
    assertEquals(code, graph.getCode());
    assertEquals(status, graph.getStatus());

    ProviderApiException drive = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.FORBIDDEN, body, CloudProvider.GOOGLE_DRIVE)
    );
    assertEquals(code, drive.getCode());
    assertEquals(status, drive.getStatus());
  }

  @Test
  void keepsNameConflictDetectionOn400() {
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(
            HttpStatus.BAD_REQUEST, "{\"error\":{\"code\":\"nameAlreadyExists\"}}")
    );
    assertEquals("ITEM_CONFLITO", ex.getCode());
  }
}
