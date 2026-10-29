package com.bridgit.api.files;

import com.bridgit.api.catalog.CatalogService;
import com.bridgit.api.catalog.CatalogStore;
import com.bridgit.api.common.error.ApiException;
import com.bridgit.api.common.error.BadRequestException;
import com.bridgit.api.common.security.AuthenticatedUserService;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionRepository;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClients;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** Searches the SQL catalog only; the providers are never called, and there is no fallback to them. */
@Service
public class SearchService {

  static final int RESULTS_PER_CONNECTION = 50;

  private final AuthenticatedUserService authenticatedUserService;
  private final ProviderConnectionRepository connectionRepository;
  private final CloudProviderClients clients;
  private final CatalogService catalog;
  private final CatalogStore store;

  public SearchService(
      AuthenticatedUserService authenticatedUserService,
      ProviderConnectionRepository connectionRepository,
      CloudProviderClients clients,
      CatalogService catalog,
      CatalogStore store
  ) {
    this.authenticatedUserService = authenticatedUserService;
    this.connectionRepository = connectionRepository;
    this.clients = clients;
    this.catalog = catalog;
    this.store = store;
  }

  public FilesDtos.SearchResponse search(String query) {
    String trimmed = query == null ? "" : query.trim();
    if (trimmed.length() < 2) {
      throw new BadRequestException("BUSCA_CURTA", "Informe pelo menos 2 caracteres para buscar.");
    }

    UUID userId = authenticatedUserService.requireUserId();
    List<ProviderConnectionEntity> connections = connectionRepository.findByUserIdOrderByCreatedAtAscIdAsc(userId);

    List<FilesDtos.SearchResult> allResults = new ArrayList<>();
    List<FilesDtos.SearchProviderStatus> statuses = new ArrayList<>();

    for (ProviderConnectionEntity connection : connections) {
      String providerId = connection.getProvider();
      UUID connectionId = connection.getId();
      try {
        if (!catalogAvailable(connection)) {
          statuses.add(new FilesDtos.SearchProviderStatus(providerId, false, "CATALOGO_INDISPONIVEL", connectionId, null));
          continue;
        }
        store.touch(connection);
        CatalogStore.SearchPage page = store.search(connection, trimmed, RESULTS_PER_CONNECTION);
        page.items().forEach(item -> allResults.add(new FilesDtos.SearchResult(item, connectionId)));
        statuses.add(new FilesDtos.SearchProviderStatus(providerId, true, null, connectionId,
            store.metadata(connection, page.state(), page.state().complete(), true)));
      } catch (ApiException ex) {
        statuses.add(new FilesDtos.SearchProviderStatus(providerId, false, ex.getCode(), connectionId, null));
      } catch (RuntimeException ex) {
        // One connection failing must not turn the whole search into a 500.
        statuses.add(new FilesDtos.SearchProviderStatus(providerId, false, "PROVEDOR_FALHOU", connectionId, null));
      }
    }

    List<FilesDtos.SearchResult> sorted = allResults.stream()
        .sorted(Comparator.comparing(
            result -> result.item().name() == null ? "" : result.item().name(), String.CASE_INSENSITIVE_ORDER))
        .toList();

    return new FilesDtos.SearchResponse(sorted, statuses);
  }

  private boolean catalogAvailable(ProviderConnectionEntity connection) {
    return catalog.enabled(clients.get(CloudProvider.fromId(connection.getProvider())));
  }
}
