package com.bridgit.api.providers.dropbox;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class DropboxApiArgTest {

  @Test
  void escapesNonAsciiCharacters() {
    String json = "{\"path\":\"/café/arquivo.txt\"}";
    String escaped = DropboxProviderClient.escapeApiArg(json);
    assertEquals("{\"path\":\"/caf\\u00e9/arquivo.txt\"}", escaped);
  }

  @Test
  void leavesAsciiUntouched() {
    String json = "{\"path\":\"/docs/file.txt\"}";
    assertEquals(json, DropboxProviderClient.escapeApiArg(json));
  }

  @Test
  void escapesCharactersForbiddenInHttpHeaderValues() throws Exception {
    String path = "/a" + Character.toString(0x7f) + "b\ncafé";
    String json = "{\"path\":\"" + path + "\"}";
    String escaped = DropboxProviderClient.escapeApiArg(json);

    assertEquals("{\"path\":\"/a\\u007fb\\u000acaf\\u00e9\"}", escaped);
    assertTrue(escaped.chars().allMatch(ch -> ch >= 0x20 && ch <= 0x7e));
    assertEquals(path, new ObjectMapper().readTree(escaped).path("path").asText());
  }
}
