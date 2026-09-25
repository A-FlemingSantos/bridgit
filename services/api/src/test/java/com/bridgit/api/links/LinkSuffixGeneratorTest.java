package com.bridgit.api.links;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class LinkSuffixGeneratorTest {

  @Test
  void generateProducesSixteenBase62Characters() {
    String suffix = LinkSuffixGenerator.generate();
    assertThat(suffix).hasSize(16);
    assertThat(LinkSuffixGenerator.isValid(suffix)).isTrue();
  }

  @Test
  void isValidRejectsMalformedSuffixes() {
    assertThat(LinkSuffixGenerator.isValid(null)).isFalse();
    assertThat(LinkSuffixGenerator.isValid("abc")).isFalse();
    assertThat(LinkSuffixGenerator.isValid("abcdefghijklmnop!")).isFalse();
    assertThat(LinkSuffixGenerator.isValid("abcdefghijklmnopq")).isFalse();
  }
}
