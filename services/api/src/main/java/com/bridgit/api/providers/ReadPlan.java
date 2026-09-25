package com.bridgit.api.providers;

public record ReadPlan(
    ReadMode mode,
    ContentVariant variant,
    String contentType
) {
}
