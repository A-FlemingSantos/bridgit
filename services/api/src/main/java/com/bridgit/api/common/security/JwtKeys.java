package com.bridgit.api.common.security;

import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

/** Signing keys derived from APP_JWT_SECRET, one per token family. */
public final class JwtKeys {

  private static final String CONTENT_TICKET_LABEL = "bridgit-content-ticket";

  private JwtKeys() {
  }

  public static SecretKey sessionKey(String secret) {
    // Sessions keep the raw secret so existing sessions stay valid.
    return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
  }

  /** Content tickets get their own key, so neither token family can be verified with the other's key. */
  public static SecretKey contentTicketKey(String secret) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      byte[] derived = mac.doFinal(CONTENT_TICKET_LABEL.getBytes(StandardCharsets.UTF_8));
      return Keys.hmacShaKeyFor(derived);
    } catch (GeneralSecurityException ex) {
      throw new IllegalStateException("HmacSHA256 indisponivel", ex);
    }
  }
}
