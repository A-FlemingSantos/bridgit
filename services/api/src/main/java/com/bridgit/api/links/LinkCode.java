package com.bridgit.api.links;

import java.security.SecureRandom;

/**
 * The short code of a public link, stored in the {@code suffix} column. New codes are 4 characters of
 * {@code [a-z0-9]}; links created before aliases existed carry 16 base62 characters (mixed case) and must
 * keep resolving. Codes are always compared case-sensitively.
 */
public final class LinkCode {

  private static final String ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
  private static final String LEGACY_ALPHABET =
      "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  static final int LENGTH = 4;
  static final int LEGACY_LENGTH = 16;
  private static final SecureRandom RANDOM = new SecureRandom();

  private LinkCode() {
  }

  public static String generate() {
    char[] chars = new char[LENGTH];
    for (int i = 0; i < LENGTH; i++) {
      chars[i] = ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length()));
    }
    return new String(chars);
  }

  public static boolean isValid(String code) {
    if (code == null) {
      return false;
    }
    if (code.length() == LENGTH) {
      return onlyFrom(code, ALPHABET);
    }
    if (code.length() == LEGACY_LENGTH) {
      return onlyFrom(code, LEGACY_ALPHABET);
    }
    return false;
  }

  private static boolean onlyFrom(String value, String alphabet) {
    for (int i = 0; i < value.length(); i++) {
      if (alphabet.indexOf(value.charAt(i)) < 0) {
        return false;
      }
    }
    return true;
  }
}
