package com.bridgit.api.integrations;

import com.bridgit.api.providers.CloudProvider;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class ProviderOAuthClients {

  private final List<ProviderOAuthClient> clients;

  public ProviderOAuthClients(List<ProviderOAuthClient> clients) {
    this.clients = List.copyOf(clients);
  }

  // Resolved per call so mocked clients can declare provider() after the context starts.
  public ProviderOAuthClient get(CloudProvider provider) {
    return clients.stream()
        .filter((client) -> client.provider() == provider)
        .findFirst()
        .orElse(null);
  }
}
