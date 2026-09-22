package com.bridgit.api.common.api;

import java.time.OffsetDateTime;
import java.util.List;

public record ApiErrorResponse(
    String code,
    String message,
    String path,
    OffsetDateTime timestamp,
    List<ApiValidationError> validations
) {
}
