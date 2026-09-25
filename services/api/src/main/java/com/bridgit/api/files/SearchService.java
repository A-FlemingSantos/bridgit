package com.bridgit.api.files;

import com.bridgit.api.common.error.BadRequestException;
import com.bridgit.api.common.security.AuthenticatedUserService;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionRepository;
import com.bridgit.api.integrations.ProviderConnectionService;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClient;
import com.bridgit.api.providers.CloudProviderClients;
import com.bridgit.api.providers.ProviderApiException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class SearchService {

  private static final int RESULTS_PER_PROVIDER = 20;
  private static final long PROVIDER_TIMEOUT_SECONDS = 8;

  private final AuthenticatedUserService authenticatedUserService;
  private final ProviderConnectionRepository connectionRepository;
  private final ProviderConnectionService connectionService;
  private final CloudProviderClients clients;
  private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

  public SearchService(
      AuthenticatedUserService authenticatedUserService,
      ProviderConnectionRepository connectionRepository,
      ProviderConnectionService connectionService,
      CloudProviderClients clients
  ) {
    this.authenticatedUserService = authenticatedUserService;
    this.connectionRepository = connectionRepository;
    this.connectionService = connectionService;
    this.clients = clients;
  }

  public FilesDtos.SearchResponse search(String query) {
    String trimmed = query == null ? "" : query.trim();
    if (trimmed.length() < 2) {
      throw new BadRequestException("BUSCA_CURTA", "Informe pelo menos 2 caracteres para buscar.");
    }

    UUID userId = authenticatedUserService.requireUserId();
    List<ProviderConnectionEntity> connections = connectionRepository.findByUserId(userId);

    List<Future<ProviderSearchResult>> futures = new ArrayList<>();
    List<String> providerIds = new ArrayList<>();
    for (ProviderConnectionEntity connection : connections) {
      providerIds.add(connection.getProvider());
      futures.add(executor.submit(searchProvider(connection, trimmed)));
    }

    List<CloudItem> allResults = new ArrayList<>();
    List<FilesDtos.SearchProviderStatus> statuses = new ArrayList<>();

    for (int i = 0; i < futures.size(); i++) {
      Future<ProviderSearchResult> future = futures.get(i);
      String providerId = providerIds.get(i);
      try {
        ProviderSearchResult result = future.get(PROVIDER_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        statuses.add(new FilesDtos.SearchProviderStatus(result.providerId(), result.ok(), result.error()));
        if (result.ok()) {
          allResults.addAll(result.items());
        }
      } catch (TimeoutException ex) {
        future.cancel(true);
        statuses.add(new FilesDtos.SearchProviderStatus(providerId, false, "PROVEDOR_FALHOU"));
      } catch (Exception ex) {
        statuses.add(new FilesDtos.SearchProviderStatus(providerId, false, "PROVEDOR_FALHOU"));
      }
    }

    List<CloudItem> sorted = allResults.stream()
        .sorted(Comparator.comparing(item -> item.name() == null ? "" : item.name(), String.CASE_INSENSITIVE_ORDER))
        .toList();

    return new FilesDtos.SearchResponse(sorted, statuses);
  }

  private Callable<ProviderSearchResult> searchProvider(ProviderConnectionEntity connection, String query) {
    return () -> {
      CloudProvider provider = CloudProvider.fromId(connection.getProvider());
      CloudProviderClient client = clients.get(provider);
      try {
        List<CloudItem> items = searchWithRetry(connection, client, query);
        return new ProviderSearchResult(provider.id(), true, null, items);
      } catch (ProviderApiException ex) {
        return new ProviderSearchResult(provider.id(), false, ex.getCode(), List.of());
      } catch (Exception ex) {
        return new ProviderSearchResult(provider.id(), false, "PROVEDOR_FALHOU", List.of());
      }
    };
  }

  private List<CloudItem> searchWithRetry(
      ProviderConnectionEntity connection,
      CloudProviderClient client,
      String query
  ) {
    String token = connectionService.accessToken(connection);
    try {
      return client.search(token, query, RESULTS_PER_PROVIDER);
    } catch (ProviderApiException ex) {
      if (ex.getStatus() == HttpStatus.UNAUTHORIZED) {
        connectionService.evict(connection.getId());
        return client.search(connectionService.accessToken(connection), query, RESULTS_PER_PROVIDER);
      }
      throw ex;
    }
  }

  private record ProviderSearchResult(String providerId, boolean ok, String error, List<CloudItem> items) {
  }
}
