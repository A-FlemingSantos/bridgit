package com.bridgit.api.providers;

import java.util.UUID;

public record CloudItemChangedEvent(
    UUID connectionId,
    CloudItem item
) {
}
