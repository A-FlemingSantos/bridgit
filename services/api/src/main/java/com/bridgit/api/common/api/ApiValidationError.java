package com.bridgit.api.common.api;

public record ApiValidationError(
    String field,
    String message
) {
}
