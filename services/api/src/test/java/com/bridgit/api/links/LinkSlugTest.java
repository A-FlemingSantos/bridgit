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

  @Test
  void folderSlugKeepsTheDotsOfTheNameAndFallsBackToPasta() {
    assertThat(LinkSlug.fromFolderName("Fotos de Férias 2024")).isEqualTo("fotos-de-ferias-2024");
    assertThat(LinkSlug.fromFolderName("v1.2")).isEqualTo("v1-2");
    assertThat(LinkSlug.fromFolderName("---")).isEqualTo("pasta");
    assertThat(LinkSlug.fromFolderName(null)).isEqualTo("pasta");
  }

  @Test
  void isValidAliasAcceptsOnlyTheCanonicalForm() {
    assertThat(LinkSlug.isValidAlias("relatorio-final")).isTrue();
    assertThat(LinkSlug.isValidAlias("a")).isTrue();
    assertThat(LinkSlug.isValidAlias("")).isFalse();
    assertThat(LinkSlug.isValidAlias("-a")).isFalse();
    assertThat(LinkSlug.isValidAlias("a-")).isFalse();
    assertThat(LinkSlug.isValidAlias("a--b")).isFalse();
    assertThat(LinkSlug.isValidAlias("A")).isFalse();
    assertThat(LinkSlug.isValidAlias("a_b")).isFalse();
  }
}
