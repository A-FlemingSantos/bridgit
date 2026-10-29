package com.bridgit.api.providers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
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
      "'{\"error\": {\"errors\": [{\"domain\": \"usageLimits\", \"reason\": \"rateLimitExceeded\", \"message\": \"Rate Limit Exceeded\"}], \"code\": 403}}', PROVEDOR_LIMITADO, TOO_MANY_REQUESTS",
      "'{\"error\": {\"errors\": [{\"domain\": \"usageLimits\", \"reason\": \"userRateLimitExceeded\", \"message\": \"User Rate Limit Exceeded\"}], \"code\": 403}}', PROVEDOR_LIMITADO, TOO_MANY_REQUESTS",
      "'{\"error\": {\"errors\": [{\"domain\": \"usageLimits\", \"reason\": \"dailyLimitExceeded\", \"message\": \"Daily Limit Exceeded\"}], \"code\": 403}}', PROVEDOR_LIMITADO, TOO_MANY_REQUESTS",
      "'{\"error\": {\"errors\": [{\"domain\": \"usageLimits\", \"reason\": \"quotaExceeded\", \"message\": \"Quota Exceeded\"}], \"code\": 403}}', PROVEDOR_LIMITADO, TOO_MANY_REQUESTS",
      "'{\"error\": {\"errors\": [{\"domain\": \"usageLimits\", \"reason\": \"sharingRateLimitExceeded\", \"message\": \"Sharing Rate Limit Exceeded\"}], \"code\": 403}}', PROVEDOR_LIMITADO, TOO_MANY_REQUESTS",
      "'{\"error\": {\"errors\": [{\"domain\": \"usageLimits\", \"reason\": \"downloadQuotaExceeded\", \"message\": \"Download Quota Exceeded\"}], \"code\": 403}}', PROVEDOR_LIMITADO, TOO_MANY_REQUESTS",
      "'{\"error\": {\"code\": \"accessDenied\"}}', SEM_PERMISSAO, FORBIDDEN",
      "'{\"error\": {\"errors\": [{\"domain\": \"global\", \"reason\": \"forbidden\", \"message\": \"The user does not have sufficient permissions\"}], \"code\": 403}}', SEM_PERMISSAO, FORBIDDEN",
      "'{\"error\": {\"errors\": [{\"domain\": \"global\", \"reason\": \"insufficientFilePermissions\", \"message\": \"Insufficient permissions\"}], \"code\": 403}}', SEM_PERMISSAO, FORBIDDEN"
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
  void driveExportSizeLimit403MapsToConversionTooLarge() {
    String body = "{\"error\": {\"errors\": [{\"domain\": \"global\", \"reason\": \"exportSizeLimitExceeded\","
        + " \"message\": \"This file is too large to be exported.\"}], \"code\": 403}}";
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.FORBIDDEN, body, CloudProvider.GOOGLE_DRIVE)
    );
    assertEquals("CONVERSAO_GRANDE_DEMAIS", ex.getCode());
    assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, ex.getStatus());
    assertEquals("Arquivo grande demais para conversão.", ex.getMessage());
  }

  @Test
  void driveStorageQuota403MapsToNoSpaceNotRateLimit() {
    String body = "{\"error\": {\"errors\": [{\"domain\": \"usageLimits\", \"reason\": \"storageQuotaExceeded\","
        + " \"message\": \"The user's Drive storage quota has been exceeded.\"}], \"code\": 403}}";
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnWriteError(
            HttpStatus.FORBIDDEN, HttpHeaders.EMPTY, body, CloudProvider.GOOGLE_DRIVE)
    );
    assertEquals("PROVEDOR_SEM_ESPACO", ex.getCode());
    assertEquals(HttpStatus.INSUFFICIENT_STORAGE, ex.getStatus());
    assertEquals("Não há espaço suficiente na conta do provedor.", ex.getMessage());
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

  @Test
  void readAndConversion413MapsToConversionTooLarge() {
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.PAYLOAD_TOO_LARGE, "")
    );
    assertEquals("CONVERSAO_GRANDE_DEMAIS", ex.getCode());
    assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, ex.getStatus());
  }

  @Test
  void write413MapsToFileTooLarge() {
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnWriteError(
            HttpStatus.PAYLOAD_TOO_LARGE, HttpHeaders.EMPTY, "", CloudProvider.ONEDRIVE)
    );
    assertEquals("ARQUIVO_GRANDE_DEMAIS", ex.getCode());
    assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, ex.getStatus());
  }

  @Test
  void writeErrorsOtherThan413KeepTheirMapping() {
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnWriteError(
            HttpStatus.NOT_FOUND, HttpHeaders.EMPTY, "", CloudProvider.GOOGLE_DRIVE)
    );
    assertEquals("ITEM_NAO_ENCONTRADO", ex.getCode());
  }

  @ParameterizedTest
  @CsvSource({
      "ONEDRIVE, '{\"error\":{\"code\":\"nameAlreadyExists\"}}'",
      "ONEDRIVE, '{\"error\":{\"code\":\"invalidRequest\",\"innerError\":{},\"innererror\":{\"code\":\"nameAlreadyExists\"}}}'"
  })
  void nameConflictOn400IsSpecificToGraphCode(CloudProvider provider, String body) {
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.BAD_REQUEST, body, provider)
    );
    assertEquals("ITEM_CONFLITO", ex.getCode());
    assertEquals(HttpStatus.CONFLICT, ex.getStatus());
  }

  @ParameterizedTest
  @CsvSource({
      "ONEDRIVE, '{\"error\":{\"code\":\"invalidRequest\",\"message\":\"merge conflict in request\"}}'",
      "ONEDRIVE, '{\"error\":{\"message\":\"The name already exists\"}}'",
      "GOOGLE_DRIVE, '{\"error\":{\"code\":\"nameAlreadyExists\"}}'",
      "DROPBOX, '{\"error\":{\"code\":\"nameAlreadyExists\"}}'",
      "ONEDRIVE, 'plain text: conflict, already exists'"
  })
  void looseConflictTextOn400IsNotANameConflict(CloudProvider provider, String body) {
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.BAD_REQUEST, body, provider)
    );
    assertEquals("PROVEDOR_FALHOU", ex.getCode());
  }

  @Test
  void unmappedClientErrorOnAWriteIsADefiniteRefusalButStaysBadGatewayOnARead() {
    ProviderApiException write = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnWriteError(
            HttpStatus.BAD_REQUEST, org.springframework.http.HttpHeaders.EMPTY, "{}", CloudProvider.ONEDRIVE)
    );
    assertEquals("PROVEDOR_FALHOU", write.getCode());
    assertEquals(HttpStatus.BAD_REQUEST, write.getStatus());

    ProviderApiException read = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.BAD_REQUEST, "{}", CloudProvider.ONEDRIVE)
    );
    assertEquals(HttpStatus.BAD_GATEWAY, read.getStatus());
  }

  @Test
  void dropboxUnrelatedConflictSubstringIsNotANameConflict() {
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(
            HttpStatus.CONFLICT, "{\"error_summary\": \"other/conflicting_state/abc\"}", CloudProvider.DROPBOX)
    );
    assertEquals("PROVEDOR_FALHOU", ex.getCode());
  }

  @ParameterizedTest
  @CsvSource({
      "'{\"error_summary\": \"path/insufficient_space/\"}'",
      "'{\"error\": {\".tag\": \"path\", \"path\": {\".tag\": \"insufficient_space\"}}}'",
      "'{\"error_summary\": \"x/\", \"error\": {\".tag\": \"path\", \"path\": {\"reason\": {\".tag\": \"insufficient_space\"}}}}'"
  })
  void dropboxInsufficientSpaceMapsToNoSpaceCode(String body) {
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.CONFLICT, body, CloudProvider.DROPBOX)
    );
    assertEquals("PROVEDOR_SEM_ESPACO", ex.getCode());
    assertEquals(HttpStatus.INSUFFICIENT_STORAGE, ex.getStatus());
  }

  @Test
  void maps507ToNoSpaceInsteadOfUnavailable() {
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.INSUFFICIENT_STORAGE, "{\"error\":{\"code\":\"quotaLimitReached\"}}")
    );
    assertEquals("PROVEDOR_SEM_ESPACO", ex.getCode());
    assertEquals(HttpStatus.INSUFFICIENT_STORAGE, ex.getStatus());
  }

  @ParameterizedTest
  @CsvSource({
      "'{\"error_summary\": \"path/malformed_path/..\"}'",
      "'{\"error\": {\".tag\": \"path\", \"path\": {\".tag\": \"malformed_path\", \"malformed_path\": \"/a//b\"}}}'"
  })
  void dropboxMalformedPathMapsToInvalidName(String body) {
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.CONFLICT, body, CloudProvider.DROPBOX)
    );
    assertEquals("NOME_INVALIDO", ex.getCode());
    assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus());
  }

  @Test
  void dropboxNestedConflictTagMapsToConflict() {
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(
            HttpStatus.CONFLICT,
            "{\"error\": {\".tag\": \"path\", \"path\": {\".tag\": \"conflict\", \"conflict\": {\".tag\": \"file\"}}}}",
            CloudProvider.DROPBOX)
    );
    assertEquals("ITEM_CONFLITO", ex.getCode());
  }

  private static final Clock NOW = Clock.fixed(Instant.parse("2026-10-14T12:00:00Z"), ZoneOffset.UTC);

  private static HttpHeaders retryAfter(String value) {
    HttpHeaders headers = new HttpHeaders();
    headers.set(HttpHeaders.RETRY_AFTER, value);
    return headers;
  }

  @Test
  void retryAfterAcceptsSecondsAndHttpDate() {
    assertEquals(12L, ProviderHttpSupport.parseRetryAfter(retryAfter("12"), NOW));
    assertEquals(90L, ProviderHttpSupport.parseRetryAfter(retryAfter("Wed, 14 Oct 2026 12:01:30 GMT"), NOW));
  }

  @Test
  void retryAfterHttpDateInThePastOrNowIsAtLeastOneSecond() {
    assertEquals(1L, ProviderHttpSupport.parseRetryAfter(retryAfter("Wed, 14 Oct 2026 11:00:00 GMT"), NOW));
    assertEquals(1L, ProviderHttpSupport.parseRetryAfter(retryAfter("Wed, 14 Oct 2026 12:00:00 GMT"), NOW));
  }

  @Test
  void retryAfterInvalidOrMissingIsNull() {
    assertNull(ProviderHttpSupport.parseRetryAfter(retryAfter("amanhã"), NOW));
    assertNull(ProviderHttpSupport.parseRetryAfter(retryAfter("-5"), NOW));
    assertNull(ProviderHttpSupport.parseRetryAfter(new HttpHeaders(), NOW));
    assertNull(ProviderHttpSupport.parseRetryAfter(null, NOW));
  }

  @Test
  void rateLimitedUsesHttpDateRetryAfterHeader() {
    HttpHeaders headers = retryAfter("Fri, 01 Jan 2100 00:00:00 GMT");
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.TOO_MANY_REQUESTS, headers, "")
    );
    assertTrue(ex.getRetryAfterSeconds() > 1);
  }

  @Test
  void dropbox429ReadsRetryAfterFromBody() {
    String body = "{\"error_summary\": \"too_many_requests/..\", \"error\": "
        + "{\"reason\": {\".tag\": \"too_many_requests\"}, \"retry_after\": 7}}";
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.TOO_MANY_REQUESTS, body, CloudProvider.DROPBOX)
    );
    assertEquals("PROVEDOR_LIMITADO", ex.getCode());
    assertEquals(7L, ex.getRetryAfterSeconds());
  }

  @Test
  void dropboxTooManyWriteOperationsReadsRetryAfterFromBody() {
    String body = "{\"error_summary\": \"too_many_write_operations/..\", \"error\": "
        + "{\".tag\": \"too_many_write_operations\", \"retry_after\": 3}}";
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.TOO_MANY_REQUESTS, body, CloudProvider.DROPBOX)
    );
    assertEquals(3L, ex.getRetryAfterSeconds());

    ProviderApiException conflict = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.CONFLICT, body, CloudProvider.DROPBOX)
    );
    assertEquals("PROVEDOR_LIMITADO", conflict.getCode());
    assertEquals(3L, conflict.getRetryAfterSeconds());
  }

  @Test
  void retryAfterHeaderTakesPrecedenceOverBody() {
    HttpHeaders headers = retryAfter("20");
    String body = "{\"error\": {\"retry_after\": 7}}";
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.TOO_MANY_REQUESTS, headers, body, CloudProvider.DROPBOX)
    );
    assertEquals(20L, ex.getRetryAfterSeconds());
  }

  @Test
  void rateLimitedWithoutAnyRetryAfterHasNone() {
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.TOO_MANY_REQUESTS, "not json", CloudProvider.DROPBOX)
    );
    assertNull(ex.getRetryAfterSeconds());
  }

  @Test
  void contentChangedAndLockedHelpers() {
    ProviderApiException changed = ProviderHttpSupport.contentChanged();
    assertEquals(HttpStatus.CONFLICT, changed.getStatus());
    assertEquals("ARQUIVO_ALTERADO", changed.getCode());
    ProviderApiException locked = ProviderHttpSupport.contentLocked();
    assertEquals(HttpStatus.LOCKED, locked.getStatus());
    assertEquals("ARQUIVO_BLOQUEADO", locked.getCode());
  }

  @Test
  void detectsDropboxConflictBodies() {
    assertTrue(ProviderHttpSupport.isDropboxConflict(
        "{\"error_summary\":\"path/conflict/file/..\",\"error\":{\".tag\":\"path\"}}"));
    assertTrue(ProviderHttpSupport.isDropboxConflict(
        "{\"error\":{\".tag\":\"path\",\"reason\":{\".tag\":\"conflict\"}}}"));
    assertFalse(ProviderHttpSupport.isDropboxConflict("{\"error_summary\":\"path/not_found/..\"}"));
    assertFalse(ProviderHttpSupport.isDropboxConflict(null));
  }

  @Test
  void existingDropboxConflictStillMapsToItemConflict() {
    ProviderApiException ex = assertThrows(ProviderApiException.class, () -> ProviderHttpSupport.throwOnWriteError(
        HttpStatus.CONFLICT, HttpHeaders.EMPTY, "{\"error_summary\":\"path/conflict/file/..\"}", CloudProvider.DROPBOX));
    assertEquals("ITEM_CONFLITO", ex.getCode());
  }
}
