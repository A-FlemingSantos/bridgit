package com.bridgit.api.providers.sync;

/** Provider preparation persisted before a write (e.g. a Google-generated item ID). */
public record PreparedWrite(String remoteRef, String state) {}
