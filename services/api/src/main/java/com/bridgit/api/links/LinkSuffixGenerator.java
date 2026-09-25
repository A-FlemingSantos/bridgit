package com.bridgit.api.links;

import java.security.SecureRandom;

public final class LinkSuffixGenerator {

  private static final String BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  private static final int LENGTH = 16;
  private static final SecureRandom RANDOM = new SecureRandom();

  private LinkSuffixGenerator() {
  }

  public static String generate() {
    char[] chars = new char[LENGTH];
    for (int i = 0; i < LENGTH; i++) {
      chars[i] = BASE62.charAt(RANDOM.nextInt(BASE62.length()));
    }
    return new String(chars);
  }

  public static boolean isValid(String suffix) {
    if (suffix == null || suffix.length() != LENGTH) {
      return false;
    }
    for (int i = 0; i < suffix.length(); i++) {
      if (BASE62.indexOf(suffix.charAt(i)) < 0) {
        return false;
      }
    }
    return true;
  }
}
