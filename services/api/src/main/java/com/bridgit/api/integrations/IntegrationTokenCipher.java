package com.bridgit.api.integrations;

import com.bridgit.api.common.error.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class IntegrationTokenCipher {

  private static final String ALGORITHM = "AES/GCM/NoPadding";
  private static final int IV_LENGTH = 12;
  private static final int TAG_LENGTH_BITS = 128;
  private static final String VERSION_PREFIX = "v1:";

  private final SecretKeySpec secretKey;
  private final SecureRandom secureRandom = new SecureRandom();

  public IntegrationTokenCipher(@Value("${app.integrations.token-key-base64:}") String keyBase64) {
    if (keyBase64 == null || keyBase64.isBlank()) {
      throw new ApiException(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "INTEGRACAO_TOKEN_KEY_AUSENTE",
          "A chave de criptografia de integracao nao esta configurada."
      );
    }

    byte[] keyBytes;
    try {
      keyBytes = Base64.getDecoder().decode(keyBase64.trim());
    } catch (IllegalArgumentException ex) {
      throw new ApiException(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "INTEGRACAO_TOKEN_KEY_AUSENTE",
          "A chave de criptografia de integracao nao esta configurada."
      );
    }

    if (keyBytes.length != 32) {
      throw new ApiException(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "INTEGRACAO_TOKEN_KEY_AUSENTE",
          "A chave de criptografia de integracao nao esta configurada."
      );
    }

    this.secretKey = new SecretKeySpec(keyBytes, "AES");
  }

  public String encrypt(String plaintext) {
    try {
      byte[] iv = new byte[IV_LENGTH];
      secureRandom.nextBytes(iv);

      Cipher cipher = Cipher.getInstance(ALGORITHM);
      cipher.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
      byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

      return VERSION_PREFIX
          + base64UrlNoPad(iv)
          + ":"
          + base64UrlNoPad(ciphertext);
    } catch (GeneralSecurityException ex) {
      throw cryptoFailure(ex);
    }
  }

  public String decrypt(String stored) {
    try {
      if (stored == null || !stored.startsWith(VERSION_PREFIX)) {
        throw new IllegalArgumentException("Formato invalido.");
      }

      String payload = stored.substring(VERSION_PREFIX.length());
      int separator = payload.indexOf(':');
      if (separator < 0) {
        throw new IllegalArgumentException("Formato invalido.");
      }

      byte[] iv = base64UrlNoPadDecode(payload.substring(0, separator));
      byte[] ciphertext = base64UrlNoPadDecode(payload.substring(separator + 1));

      Cipher cipher = Cipher.getInstance(ALGORITHM);
      cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
      byte[] plaintext = cipher.doFinal(ciphertext);
      return new String(plaintext, StandardCharsets.UTF_8);
    } catch (GeneralSecurityException | IllegalArgumentException ex) {
      throw cryptoFailure(ex);
    }
  }

  private static String base64UrlNoPad(byte[] value) {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
  }

  private static byte[] base64UrlNoPadDecode(String value) {
    return Base64.getUrlDecoder().decode(value);
  }

  private static ApiException cryptoFailure(Exception ex) {
    return new ApiException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "INTEGRACAO_TOKEN_CRIPTO_FALHOU",
        "Nao foi possivel proteger o token de integracao."
    );
  }
}
