package com.bridgit.api.providers;

import com.bridgit.api.common.error.ApiException;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class CloudProviderClients {

  private final Map<CloudProvider, CloudProviderClient> clients;

  // Spring injects the list sorted by @Order, so a higher-precedence bean replaces the default client.
  public CloudProviderClients(List<CloudProviderClient> clients) {
    this.clients = Map.copyOf(clients.stream()
        .collect(Collectors.toMap(CloudProviderClient::provider, Function.identity(), (first, ignored) -> first)));
  }

  public CloudProviderClient get(CloudProvider provider) {
    CloudProviderClient client = clients.get(provider);
    if (client == null) {
      throw new ApiException(
          HttpStatus.SERVICE_UNAVAILABLE,
          "PROVEDOR_INDISPONIVEL",
          "Este provedor de nuvem ainda nao esta disponivel."
      );
    }
    return client;
  }
}
