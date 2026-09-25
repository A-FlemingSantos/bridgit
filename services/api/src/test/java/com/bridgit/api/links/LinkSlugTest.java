package com.bridgit.api.links;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class LinkSlugTest {

  @Test
  void slugifyRemovesExtensionAndNormalizesAccents() {
    assertThat(LinkSlug.fromFileName("Relatório Final.PDF", "pdf"))
        .isEqualTo("relatorio-final");
  }

  @Test
  void slugifyCollapsesNonAlphanumericCharacters() {
    assertThat(LinkSlug.fromFileName("My  --  File!!", "txt"))
        .isEqualTo("my-file");
  }

  @Test
  void slugifyTrimsToMaxLength() {
    String longName = "a".repeat(80);
    assertThat(LinkSlug.fromFileName(longName, null).length()).isLessThanOrEqualTo(60);
  }

  @Test
  void slugifyUsesFallbackWhenEmpty() {
    assertThat(LinkSlug.fromFileName("---", null)).isEqualTo("arquivo");
    assertThat(LinkSlug.fromFileName(null, null)).isEqualTo("arquivo");
  }
}
