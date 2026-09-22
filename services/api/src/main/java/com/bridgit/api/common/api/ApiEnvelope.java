package com.bridgit.api.common.api;

public record ApiEnvelope<T>(
    boolean success,
    T data,
    ApiErrorResponse error
) {

  public static <T> ApiEnvelope<T> ok(T data) {
    return new ApiEnvelope<>(true, data, null);
  }

  public static <T> ApiEnvelope<T> error(ApiErrorResponse error) {
    return new ApiEnvelope<>(false, null, error);
  }
}
