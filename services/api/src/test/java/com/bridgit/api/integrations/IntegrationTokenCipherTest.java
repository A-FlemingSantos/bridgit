package com.bridgit.api.integrations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.bridgit.api.common.error.ApiException;
import org.junit.jupiter.api.Test;

class IntegrationTokenCipherTest {

  private static final String VALID_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

  @Test
  void encryptsAndDecryptsRoundTrip() {
    IntegrationTokenCipher cipher = new IntegrationTokenCipher(VALID_KEY);

    String plaintext = "refresh-token-value-12345";
    String encrypted = cipher.encrypt(plaintext);

    assertThat(encrypted).startsWith("v1:");
    assertThat(cipher.decrypt(encrypted)).isEqualTo(plaintext);
  }

  @Test
  void rejectsTamperedCiphertext() {
    IntegrationTokenCipher cipher = new IntegrationTokenCipher(VALID_KEY);
    String encrypted = cipher.encrypt("secret-token");
    String tampered = encrypted.substring(0, encrypted.length() - 4) + "AAAA";

    assertThatThrownBy(() -> cipher.decrypt(tampered))
        .isInstanceOf(ApiException.class)
        .extracting(ex -> ((ApiException) ex).getCode())
        .isEqualTo("INTEGRACAO_TOKEN_CRIPTO_FALHOU");
  }

  @Test
  void rejectsInvalidKeyLength() {
    assertThatThrownBy(() -> new IntegrationTokenCipher("c2hvcnQ="))
        .isInstanceOf(ApiException.class)
        .extracting(ex -> ((ApiException) ex).getCode())
        .isEqualTo("INTEGRACAO_TOKEN_KEY_AUSENTE");
  }
}
