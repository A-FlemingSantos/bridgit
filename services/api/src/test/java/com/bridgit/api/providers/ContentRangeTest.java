package com.bridgit.api.providers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

class ContentRangeTest {

  @Test
  void parsesInitialRange() {
    ContentRange range = ContentRange.parseSingle("bytes=0-99", 1000L);
    assertEquals(0L, range.start());
    assertEquals(99L, range.end());
    assertEquals("bytes=0-99", range.headerValue());
  }

  @Test
  void parsesOpenEndedRange() {
    ContentRange range = ContentRange.parseSingle("bytes=500-", 1000L);
    assertEquals(500L, range.start());
    assertNull(range.end());
    assertEquals("bytes=500-", range.headerValue());
  }

  @Test
  void parsesSuffixRange() {
    ContentRange range = ContentRange.parseSingle("bytes=-200", 1000L);
    assertEquals(800L, range.start());
    assertEquals(999L, range.end());
  }

  @Test
  void rejectsMultiRangeAndMalformed() {
    assertNull(ContentRange.parseSingle("bytes=0-10,20-30", 1000L));
    assertNull(ContentRange.parseSingle("items=0-10", 1000L));
    assertNull(ContentRange.parseSingle("bytes=abc-def", 1000L));
    assertNull(ContentRange.parseSingle("bytes=10-5", 1000L));
    assertNull(ContentRange.parseSingle(null, 1000L));
  }

  @Test
  void suffixWithoutKnownSizeIsIgnored() {
    assertNull(ContentRange.parseSingle("bytes=-200", null));
  }
}
