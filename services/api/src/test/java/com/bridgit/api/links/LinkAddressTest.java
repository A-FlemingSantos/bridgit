package com.bridgit.api.links;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class LinkAddressTest {

  @Test
  void splitsAtTheLastDash() {
    LinkAddress address = LinkAddress.parse("relatorio-final-a1b2").orElseThrow();
    assertThat(address.alias()).isEqualTo("relatorio-final");
    assertThat(address.code()).isEqualTo("a1b2");
    assertThat(address.canonical()).isEqualTo("relatorio-final-a1b2");
  }

  @Test
  void keepsLegacyCodesCaseSensitiveAndLowercasesTheAlias() {
    LinkAddress address = LinkAddress.parse("Relatorio-AbCdEfGhIjKlMnOp").orElseThrow();
    assertThat(address.alias()).isEqualTo("relatorio");
    assertThat(address.code()).isEqualTo("AbCdEfGhIjKlMnOp");
  }

  @Test
  void rejectsMalformedReferences() {
    assertThat(LinkAddress.parse(null)).isEmpty();
    assertThat(LinkAddress.parse("")).isEmpty();
    assertThat(LinkAddress.parse("a1b2")).isEmpty();
    assertThat(LinkAddress.parse("-a1b2")).isEmpty();
    assertThat(LinkAddress.parse("relatorio-")).isEmpty();
    assertThat(LinkAddress.parse("relatorio-abc")).isEmpty();
    assertThat(LinkAddress.parse("relatorio-ABCD")).isEmpty();
    assertThat(LinkAddress.parse("relatorio--a1b2")).isEmpty();
    assertThat(LinkAddress.parse("rela_torio-a1b2")).isEmpty();
    assertThat(LinkAddress.parse("a".repeat(61) + "-a1b2")).isEmpty();
  }
}
