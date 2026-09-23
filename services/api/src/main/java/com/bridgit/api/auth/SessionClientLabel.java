package com.bridgit.api.auth;

public final class SessionClientLabel {

  private SessionClientLabel() {
  }

  public record Label(String browser, String device) {
  }

  public static Label fromUserAgent(String userAgent) {
    String agent = userAgent == null ? "" : userAgent;
    return new Label(browser(agent), device(agent));
  }

  private static String browser(String agent) {
    if (contains(agent, "Edg/") || contains(agent, "EdgA/") || contains(agent, "EdgiOS")) {
      return "Edge";
    }
    if (contains(agent, "OPR/") || contains(agent, "Opera")) {
      return "Opera";
    }
    if (contains(agent, "Brave")) {
      return "Brave";
    }
    if (contains(agent, "Firefox/") && !contains(agent, "Seamonkey")) {
      return "Firefox";
    }
    if ((contains(agent, "Chrome/") || contains(agent, "CriOS/")) && !contains(agent, "Chromium")) {
      return "Chrome";
    }
    if (contains(agent, "Safari/") && !contains(agent, "Chrome/") && !contains(agent, "Chromium")) {
      return "Safari";
    }
    return "Navegador";
  }

  private static String device(String agent) {
    if (contains(agent, "iPhone")) {
      return "iPhone";
    }
    if (contains(agent, "iPad")) {
      return "iPad";
    }
    if (contains(agent, "Android")) {
      return "Android";
    }
    if (contains(agent, "Windows")) {
      return "Windows";
    }
    if (contains(agent, "Macintosh") || contains(agent, "Mac OS")) {
      return "Mac";
    }
    if (contains(agent, "CrOS")) {
      return "ChromeOS";
    }
    if (contains(agent, "Linux")) {
      return "Linux";
    }
    return "Dispositivo";
  }

  private static boolean contains(String agent, String token) {
    return agent.contains(token);
  }
}
