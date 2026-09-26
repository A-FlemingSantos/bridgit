package com.bridgit.api.files;

import com.bridgit.api.common.error.BadRequestException;
import com.bridgit.api.common.security.AuthenticatedUserService;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionRepository;
import com.bridgit.api.integrations.ProviderRetryService;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClient;
import com.bridgit.api.providers.CloudProviderClients;
import com.bridgit.api.providers.ProviderApiException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class SearchService {

  static final int RESULTS_PER_PROVIDER = 20;
  static final int MAX_CONCURRENT_PROVIDERS = 6;

  private final AuthenticatedUserService authenticatedUserService;
  private final ProviderConnectionRepository connectionRepository;
  private final ProviderRetryService retryService;
  private final CloudProviderClients clients;
  private final Duration searchBudget;
  private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
  private final Semaphore concurrency = new Semaphore(MAX_CONCURRENT_PROVIDERS);

  public SearchService(
      AuthenticatedUserService authenticatedUserService,
      ProviderConnectionRepository connectionRepository,
      ProviderRetryService retryService,
      CloudProviderClients clients,
      @Value("${app.search.budget-ms:8000}") long budgetMs
  ) {
    this.authenticatedUserService = authenticatedUserService;
    this.connectionRepository = connectionRepository;
    this.retryService = retryService;
    this.clients = clients;
    this.searchBudget = Duration.ofMillis(budgetMs);
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
    long deadlineNanos = System.nanoTime() + searchBudget.toNanos();

    for (int i = 0; i < futures.size(); i++) {
      Future<ProviderSearchResult> future = futures.get(i);
      String providerId = providerIds.get(i);
      long remainingNanos = deadlineNanos - System.nanoTime();
      if (remainingNanos <= 0) {
        future.cancel(true);
        statuses.add(new FilesDtos.SearchProviderStatus(providerId, false, "PROVEDOR_TEMPO_ESGOTADO"));
        continue;
      }
      try {
        ProviderSearchResult result = future.get(remainingNanos, TimeUnit.NANOSECONDS);
        statuses.add(new FilesDtos.SearchProviderStatus(result.providerId(), result.ok(), result.error()));
        if (result.ok()) {
          allResults.addAll(result.items());
        }
      } catch (TimeoutException ex) {
        future.cancel(true);
        statuses.add(new FilesDtos.SearchProviderStatus(providerId, false, "PROVEDOR_TEMPO_ESGOTADO"));
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
      boolean acquired = false;
      try {
        acquired = concurrency.tryAcquire(searchBudget.toMillis(), TimeUnit.MILLISECONDS);
        if (!acquired) {
          return new ProviderSearchResult(provider.id(), false, "PROVEDOR_TEMPO_ESGOTADO", List.of());
        }
        List<CloudItem> items = retryService.withRetry(
            connection,
            token -> client.search(token, query, RESULTS_PER_PROVIDER)
        );
        return new ProviderSearchResult(provider.id(), true, null, items);
      } catch (ProviderApiException ex) {
        return new ProviderSearchResult(provider.id(), false, ex.getCode(), List.of());
      } catch (Exception ex) {
        return new ProviderSearchResult(provider.id(), false, "PROVEDOR_FALHOU", List.of());
      } finally {
        if (acquired) {
          concurrency.release();
        }
      }
    };
  }

  private record ProviderSearchResult(String providerId, boolean ok, String error, List<CloudItem> items) {
  }
}
