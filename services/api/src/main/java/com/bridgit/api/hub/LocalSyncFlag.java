package com.bridgit.api.hub;

import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;

public final class LocalSyncFlag {

  private static final String ATTRIBUTE = "bridgitLocalSyncPending";

  private LocalSyncFlag() {
  }

  public static void markPending() {
    RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
    if (attributes != null) {
      attributes.setAttribute(ATTRIBUTE, Boolean.TRUE, RequestAttributes.SCOPE_REQUEST);
    }
  }

  public static boolean isPending() {
    RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
    return attributes != null && Boolean.TRUE.equals(attributes.getAttribute(ATTRIBUTE, RequestAttributes.SCOPE_REQUEST));
  }
}
