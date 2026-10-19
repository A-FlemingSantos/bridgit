package com.bridgit.api.links;

import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClient;

/**
 * A public link that passed every anonymous check: both alias and code matched, the visitor is within the
 * limits and the shared item was fetched from the provider. {@code root} is the item the link points to
 * (the file itself, or the shared folder). Provider calls go through
 * {@code retryService.withRetry(connection, token -> client...)}.
 */
record ResolvedPublicLink(
    PublicLinkEntity link,
    ProviderConnectionEntity connection,
    CloudProvider provider,
    CloudProviderClient client,
    CloudItem root
) {
}
