package com.bridgit.api.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class SessionClientLabelTest {

  @Test
  void readsChromeOnWindows() {
    SessionClientLabel.Label label = SessionClientLabel.fromUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    );

    assertEquals("Chrome", label.browser());
    assertEquals("Windows", label.device());
  }

  @Test
  void readsEdgeBeforeChrome() {
    SessionClientLabel.Label label = SessionClientLabel.fromUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0"
    );

    assertEquals("Edge", label.browser());
    assertEquals("Windows", label.device());
  }

  @Test
  void readsSafariOnIphone() {
    SessionClientLabel.Label label = SessionClientLabel.fromUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    );

    assertEquals("Safari", label.browser());
    assertEquals("iPhone", label.device());
  }

  @Test
  void readsFirefoxOnLinux() {
    SessionClientLabel.Label label = SessionClientLabel.fromUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0"
    );

    assertEquals("Firefox", label.browser());
    assertEquals("Linux", label.device());
  }
}
