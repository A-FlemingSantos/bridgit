package com.bridgit.api.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/webhooks")
public class ProviderWebhooksController {
  private final ProviderWatchService watches;
  private final ObjectMapper json;
  private final String dropboxSecret;
  public ProviderWebhooksController(ProviderWatchService watches, ObjectMapper json,
      @Value("${app.providers.dropbox.client-secret:}") String dropboxSecret) {
    this.watches = watches; this.json = json; this.dropboxSecret = dropboxSecret;
  }
  @PostMapping("/onedrive/{connection}")
  public ResponseEntity<String> graph(@PathVariable UUID connection, @RequestParam(required = false) String validationToken,
      @RequestBody(required = false) JsonNode payload) {
    if (validationToken != null && validationToken.length() <= 2048) return ResponseEntity.ok().contentType(MediaType.TEXT_PLAIN).body(validationToken);
    if (payload != null) for (JsonNode notification : payload.path("value")) {
      if (watches.matches(connection, notification.path("clientState").asText(null), notification.path("subscriptionId").asText(null), null)) watches.changed(connection);
    }
    return ResponseEntity.accepted().body("");
  }
  @PostMapping("/google-drive/{connection}")
  public ResponseEntity<Void> google(@PathVariable UUID connection,
      @RequestHeader(value = "X-Goog-Channel-Token", required = false) String token,
      @RequestHeader(value = "X-Goog-Channel-ID", required = false) String channel,
      @RequestHeader(value = "X-Goog-Resource-ID", required = false) String resource) {
    if (channel != null && resource != null && watches.matches(connection, token, channel, resource)) watches.changed(connection);
    return ResponseEntity.noContent().build();
  }
  @GetMapping("/dropbox")
  public ResponseEntity<String> challenge(@RequestParam String challenge) {
    if (challenge.length() > 2048 || !challenge.matches("[A-Za-z0-9_-]+")) return ResponseEntity.badRequest().build();
    return ResponseEntity.ok().contentType(MediaType.TEXT_PLAIN).header("X-Content-Type-Options", "nosniff").body(challenge);
  }
  @PostMapping("/dropbox")
  public ResponseEntity<Void> dropbox(@RequestHeader(value = "X-Dropbox-Signature", required = false) String signature,
      @RequestBody byte[] body) throws Exception {
    if (signature == null || dropboxSecret.isBlank()) return ResponseEntity.status(403).build();
    Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(dropboxSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
    String expected = HexFormat.of().formatHex(mac.doFinal(body));
    if (!MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), signature.getBytes(StandardCharsets.UTF_8))) return ResponseEntity.status(403).build();
    JsonNode payload = json.readTree(body);
    for (JsonNode account : payload.path("list_folder").path("accounts")) watches.dropboxChanged(account.asText());
    return ResponseEntity.noContent().build();
  }
}
