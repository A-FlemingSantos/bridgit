package com.bridgit.api.providers;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ContentStreamResponderFilenameTest {

  @Test
  void keepsPlainAsciiNames() {
    assertThat(ContentStreamResponder.asciiFilename("Relatorio final (v2).pdf")).isEqualTo("Relatorio final (v2).pdf");
  }

  @Test
  void foldsAccentsAndReplacesWhatLatin1CannotCarry() {
    assertThat(ContentStreamResponder.asciiFilename("Pivot — Novo TCC.md")).isEqualTo("Pivot _ Novo TCC.md");
    assertThat(ContentStreamResponder.asciiFilename("Avaliação ✓.docx")).isEqualTo("Avaliacao _.docx");
  }

  @Test
  void dropsQuotesBackslashesAndLineBreaks() {
    assertThat(ContentStreamResponder.asciiFilename("a\"b\\c\r\nd.txt")).isEqualTo("abcd.txt");
  }
}
