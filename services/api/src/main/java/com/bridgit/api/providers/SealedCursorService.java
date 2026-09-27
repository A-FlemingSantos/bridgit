package com.bridgit.api.providers;

import com.bridgit.api.common.error.BadRequestException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class SealedCursorService {

  static final Duration CURSOR_TTL = Duration.ofHours(1);
  private static final String SUBKEY_CONTEXT = "bridgit-cursor-v1";

  private final byte[] subkey;
  private final Clock clock;
  private final ObjectMapper objectMapper;

  public SealedCursorService(
      @Value("${app.integrations.token-key-base64:}") String keyBase64,
      Clock clock,
      ObjectMapper objectMapper
  ) {
    this.clock = clock;
    this.objectMapper = objectMapper;
    this.subkey = deriveSubkey(decodeKey(keyBase64));
  }

  public String seal(UUID connectionId, String parentRef, String rawContinuation) {
    if (rawContinuation == null || rawContinuation.isBlank()) {
      return null;
    }
    try {
      ObjectNode payload = objectMapper.createObjectNode();
      payload.put("c", connectionId.toString());
      payload.put("p", normalizeParent(parentRef));
      payload.put("r", rawContinuation);
      payload.put("e", Instant.now(clock).plus(CURSOR_TTL).getEpochSecond());
      String encoded = base64Url(payload.toString().getBytes(StandardCharsets.UTF_8));
      return encoded + "." + base64Url(hmac(encoded));
    } catch (Exception ex) {
      throw new BadRequestException("CURSOR_INVALIDO", "Cursor de paginacao invalido.");
    }
  }

  public String unseal(String cursor, UUID connectionId, String parentRef) {
    try {
      if (cursor == null || cursor.isBlank()) {
        return null;
      }
      int dot = cursor.indexOf('.');
      if (dot < 0) {
        throw invalid();
      }
      String encoded = cursor.substring(0, dot);
      byte[] mac = base64UrlDecode(cursor.substring(dot + 1));
      if (!MessageDigest.isEqual(mac, hmac(encoded))) {
        throw invalid();
      }
      ObjectNode payload = (ObjectNode) objectMapper.readTree(base64UrlDecode(encoded));
      long expiresAt = payload.path("e").asLong(0);
      if (expiresAt <= Instant.now(clock).getEpochSecond()) {
        throw invalid();
      }
      if (!connectionId.toString().equals(payload.path("c").asText(null))) {
        throw invalid();
      }
      if (!normalizeParent(parentRef).equals(payload.path("p").asText(null))) {
        throw invalid();
      }
      String raw = payload.path("r").asText(null);
      if (raw == null || raw.isBlank()) {
        throw invalid();
      }
      return raw;
    } catch (BadRequestException ex) {
      throw ex;
    } catch (Exception ex) {
      throw invalid();
    }
  }

  private byte[] hmac(String encoded) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(subkey, "HmacSHA256"));
      return mac.doFinal(encoded.getBytes(StandardCharsets.UTF_8));
    } catch (Exception ex) {
      throw new IllegalStateException("Nao foi possivel validar o cursor de paginacao.");
    }
  }

  private static byte[] decodeKey(String keyBase64) {
    if (keyBase64 == null || keyBase64.isBlank()) {
      throw new IllegalStateException("A chave de criptografia de integracao nao esta configurada.");
    }
    byte[] bytes = Base64.getDecoder().decode(keyBase64.trim());
    if (bytes.length != 32) {
      throw new IllegalStateException("A chave de criptografia de integracao nao esta configurada.");
    }
    return bytes;
  }

  private static byte[] deriveSubkey(byte[] key) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(key, "HmacSHA256"));
      return mac.doFinal(SUBKEY_CONTEXT.getBytes(StandardCharsets.UTF_8));
    } catch (Exception ex) {
      throw new IllegalStateException("Nao foi possivel derivar a chave do cursor.");
    }
  }

  static String normalizeParent(String parentRef) {
    return parentRef == null || parentRef.isBlank() ? "" : parentRef;
  }

  private static BadRequestException invalid() {
    return new BadRequestException("CURSOR_INVALIDO", "Cursor de paginacao invalido.");
  }

  private static String base64Url(byte[] value) {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
  }

  private static byte[] base64UrlDecode(String value) {
    return Base64.getUrlDecoder().decode(value);
  }
}
