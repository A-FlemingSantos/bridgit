package com.bridgit.api.links;

import java.util.Locale;
import java.util.Optional;

/**
 * What a public URL names: {@code <alias>-<code>}, split at the last dash (aliases contain dashes, codes
 * never do). The alias is looked up in lowercase; the code is case-sensitive.
 */
record LinkAddress(String alias, String code) {

  static Optional<LinkAddress> parse(String linkRef) {
    if (linkRef == null) {
      return Optional.empty();
    }
    int dash = linkRef.lastIndexOf('-');
    if (dash <= 0 || dash == linkRef.length() - 1) {
      return Optional.empty();
    }
    String code = linkRef.substring(dash + 1);
    String alias = linkRef.substring(0, dash).toLowerCase(Locale.ROOT);
    if (!LinkCode.isValid(code) || !LinkSlug.isValidAlias(alias)) {
      return Optional.empty();
    }
    return Optional.of(new LinkAddress(alias, code));
  }

  String canonical() {
    return alias + "-" + code;
  }
}
