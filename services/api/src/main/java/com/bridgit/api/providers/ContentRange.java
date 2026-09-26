package com.bridgit.api.providers;

public record ContentRange(long start, Long end) {

  public String headerValue() {
    return end == null ? "bytes=" + start + "-" : "bytes=" + start + "-" + end;
  }

  public static ContentRange parseSingle(String header, Long totalSize) {
    if (header == null) {
      return null;
    }
    String value = header.trim();
    if (!value.startsWith("bytes=")) {
      return null;
    }
    String spec = value.substring("bytes=".length()).trim();
    if (spec.isEmpty() || spec.contains(",")) {
      return null;
    }
    try {
      if (spec.startsWith("-")) {
        long suffix = Long.parseLong(spec.substring(1).trim());
        if (suffix <= 0 || totalSize == null || totalSize <= 0) {
          return null;
        }
        long start = Math.max(totalSize - suffix, 0);
        return new ContentRange(start, totalSize - 1);
      }
      int dash = spec.indexOf('-');
      if (dash < 0) {
        return null;
      }
      long start = Long.parseLong(spec.substring(0, dash).trim());
      String endPart = spec.substring(dash + 1).trim();
      if (start < 0) {
        return null;
      }
      if (endPart.isEmpty()) {
        return new ContentRange(start, null);
      }
      long end = Long.parseLong(endPart);
      if (end < start) {
        return null;
      }
      return new ContentRange(start, end);
    } catch (NumberFormatException ex) {
      return null;
    }
  }
}
