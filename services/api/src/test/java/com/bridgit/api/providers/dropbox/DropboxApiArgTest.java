package com.bridgit.api.providers.dropbox;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
}
