package com.bridgit.api.providers;

import java.util.UUID;

public record CloudItemDeletedEvent(
    UUID connectionId,
    String ref
) {
}
