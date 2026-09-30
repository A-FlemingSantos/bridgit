package com.bridgit.api.catalog;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.springframework.stereotype.Component;

@Component
public class HubJson {
  private final ObjectMapper mapper;
  public HubJson(ObjectMapper mapper) { this.mapper = mapper; }
  public String write(Object value) {
    try { return mapper.writeValueAsString(value); }
    catch (Exception ex) { throw new IllegalStateException("Cannot serialize hub state", ex); }
  }
  public <T> T read(String value, Class<T> type) {
    if (value == null) return null;
    try { return mapper.readValue(value, type); }
    catch (Exception ex) { throw new IllegalStateException("Invalid stored hub state", ex); }
  }
  public static String hash(String value) {
    try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
    catch (Exception ex) { throw new IllegalStateException(ex); }
  }
}
