package com.bridgit.api.integrations;

/** Profile photo bytes as fetched from the provider. */
public record AvatarImage(byte[] bytes, String contentType) {
}
