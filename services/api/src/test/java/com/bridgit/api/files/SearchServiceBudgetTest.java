package com.bridgit.api.files;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.bridgit.api.common.security.AuthenticatedUserService;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionRepository;
import com.bridgit.api.integrations.ProviderRetryService;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClient;
import com.bridgit.api.providers.CloudProviderClients;
import com.bridgit.api.providers.ItemKind;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class SearchServiceBudgetTest {

  private static ProviderConnectionEntity connection(String provider) {
    ProviderConnectionEntity entity = new ProviderConnectionEntity();
    entity.setId(UUID.randomUUID());
    entity.setUserId(UUID.randomUUID());
    entity.setProvider(provider);
    entity.setAccountId("a");
    entity.setEncryptedRefreshToken("enc");
    entity.setConnectedAt(OffsetDateTime.now());
    return entity;
  }

  private static CloudItem file(String ref, String name) {
    return new CloudItem(ref, "onedrive", name, ItemKind.FILE, "text/plain", "txt", 1L, null, null);
  }

  private SearchService serviceFor(List<ProviderConnectionEntity> connections, CloudProviderClients clients) {
    AuthenticatedUserService auth = mock(AuthenticatedUserService.class);
    when(auth.requireUserId()).thenReturn(UUID.randomUUID());
    ProviderConnectionRepository repository = mock(ProviderConnectionRepository.class);
    when(repository.findByUserId(any())).thenReturn(connections);
    ProviderRetryService retry = mock(ProviderRetryService.class);
    when(retry.withRetry(any(), any())).thenAnswer(invocation -> {
      ProviderRetryService.TokenCall<?> call = invocation.getArgument(1);
      return call.execute("token");
    });
    return new SearchService(auth, repository, retry, clients, 300);
  }

  @Test
  void threeStuckProvidersRespectSingleBudget() throws Exception {
    CountDownLatch release = new CountDownLatch(1);
    CloudProviderClients clients = mock(CloudProviderClients.class);
    for (CloudProvider provider : CloudProvider.values()) {
      CloudProviderClient client = mock(CloudProviderClient.class);
      when(client.search(anyString(), anyString(), anyInt())).thenAnswer(invocation -> {
        release.await(30, TimeUnit.SECONDS);
        return List.of();
      });
      when(clients.get(provider)).thenReturn(client);
    }

    List<ProviderConnectionEntity> connections = List.of(
        connection("onedrive"), connection("google-drive"), connection("dropbox"));
    SearchService service = serviceFor(connections, clients);

    long started = System.nanoTime();
    FilesDtos.SearchResponse response = service.search("relatorio");
    long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
    release.countDown();

    assertTrue(elapsedMs < 600, "search must respect one global budget, took " + elapsedMs + "ms");
    assertTrue(response.results().isEmpty());
    assertEquals(3, response.providers().size());
    for (FilesDtos.SearchProviderStatus status : response.providers()) {
      assertEquals("PROVEDOR_TEMPO_ESGOTADO", status.error());
    }
  }

  @Test
  void fastProviderResultsSurviveSlowProviders() {
    CloudProviderClients clients = mock(CloudProviderClients.class);
    CloudProviderClient fast = mock(CloudProviderClient.class);
    when(fast.search(anyString(), anyString(), anyInt()))
        .thenReturn(List.of(file("f1", "Relatorio.pdf")));
    CloudProviderClient slow = mock(CloudProviderClient.class);
    when(slow.search(anyString(), anyString(), anyInt())).thenAnswer(invocation -> {
      Thread.sleep(10_000);
      return List.of();
    });
    when(clients.get(CloudProvider.ONEDRIVE)).thenReturn(fast);
    when(clients.get(CloudProvider.GOOGLE_DRIVE)).thenReturn(slow);
    when(clients.get(CloudProvider.DROPBOX)).thenReturn(slow);

    List<ProviderConnectionEntity> connections = List.of(
        connection("onedrive"), connection("google-drive"), connection("dropbox"));
    SearchService service = serviceFor(connections, clients);

    FilesDtos.SearchResponse response = service.search("relatorio");

    assertEquals(1, response.results().size());
    assertEquals("f1", response.results().get(0).ref());
    assertEquals(3, response.providers().size());
  }
}
