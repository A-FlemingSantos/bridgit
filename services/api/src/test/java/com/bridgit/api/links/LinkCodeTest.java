package com.bridgit.api.links;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class LinkCodeTest {

  @Test
  void generateProducesFourLowercaseAlphanumericCharacters() {
    for (int i = 0; i < 200; i++) {
      String code = LinkCode.generate();
      assertThat(code).matches("[a-z0-9]{4}");
      assertThat(LinkCode.isValid(code)).isTrue();
    }
  }

  @Test
  void isValidAcceptsLegacySixteenCharacterMixedCaseCodes() {
    assertThat(LinkCode.isValid("AbCdEfGhIjKlMnOp")).isTrue();
    assertThat(LinkCode.isValid("0123456789abcdef")).isTrue();
  }

  @Test
  void isValidRejectsMalformedCodes() {
    assertThat(LinkCode.isValid(null)).isFalse();
    assertThat(LinkCode.isValid("")).isFalse();
    assertThat(LinkCode.isValid("abc")).isFalse();
    assertThat(LinkCode.isValid("abcde")).isFalse();
    assertThat(LinkCode.isValid("AbCd")).isFalse();
    assertThat(LinkCode.isValid("ab-d")).isFalse();
    assertThat(LinkCode.isValid("abcdefghijklmnop!")).isFalse();
    assertThat(LinkCode.isValid("AbCdEfGhIjKlMnO!")).isFalse();
    assertThat(LinkCode.isValid("abcdefghijklmnopq")).isFalse();
  }
}
