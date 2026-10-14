package com.bridgit.api.integrations;

import com.bridgit.api.common.error.ApiException;
import com.bridgit.api.providers.CloudProvider;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class ProviderOAuthClients {

  private final List<ProviderOAuthClient> clients;

  public ProviderOAuthClients(List<ProviderOAuthClient> clients) {
    this.clients = List.copyOf(clients);
  }

  static ApiException notConfigured() {
    return new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "PROVEDOR_NAO_CONFIGURADO",
        "Este provedor ainda não foi configurado no servidor."
    );
  }

  // Resolved per call so mocked clients can declare provider() after the context starts.
  public ProviderOAuthClient get(CloudProvider provider) {
    return clients.stream()
        .filter((client) -> client.provider() == provider)
        .findFirst()
        .orElseThrow(ProviderOAuthClients::notConfigured);
  }
}
