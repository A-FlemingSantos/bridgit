package com.bridgit.api.providers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
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
  void maps409ToConflict() {
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.CONFLICT, "")
    );
    assertEquals("ITEM_CONFLITO", ex.getCode());
  }

  @Test
  void maps429ToProviderFailure() {
    ProviderApiException ex = assertThrows(
        ProviderApiException.class,
        () -> ProviderHttpSupport.throwOnError(HttpStatus.TOO_MANY_REQUESTS, "")
    );
    assertEquals("PROVEDOR_FALHOU", ex.getCode());
    assertEquals(HttpStatus.BAD_GATEWAY, ex.getStatus());
  }
}
