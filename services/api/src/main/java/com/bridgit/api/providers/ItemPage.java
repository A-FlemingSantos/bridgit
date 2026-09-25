package com.bridgit.api.providers;

import java.util.List;

public record ItemPage(
    List<CloudItem> items,
    String nextCursor
) {
}
