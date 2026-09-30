package com.bridgit.api.providers.sync;

import java.time.Instant;

public record WatchRegistration(String id, String resourceId, Instant expiresAt) {}
