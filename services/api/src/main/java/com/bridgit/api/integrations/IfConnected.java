package com.bridgit.api.integrations;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a {@link ConnectionScope} parameter that resolves to {@code null}, instead of answering 409, when the
 * connection is gone. Used by deletes, which stay idempotent: removing something from a disconnected account
 * has nothing left to remove.
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface IfConnected {
}
