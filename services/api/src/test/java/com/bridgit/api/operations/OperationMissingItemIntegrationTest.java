package com.bridgit.api.operations;

import com.bridgit.api.ApiIntegrationTestSupport;
import com.bridgit.api.catalog.CatalogStore;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionRepository;
import com.bridgit.api.integrations.ProviderRetryService;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClient;
import com.bridgit.api.providers.CloudProviderClients;
import com.bridgit.api.providers.ItemKind;
import com.bridgit.api.providers.ProviderApiException;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** DELETE/UPDATE whose pre-read (client.get) answers 404: delete is done, update is rejected. */
@TestPropertySource(properties = {"app.hub.catalog-enabled=true", "app.hub.operations-enabled=true",
    "app.hub.worker-enabled=false", "app.hub.direct-read-enabled=false"})
class OperationMissingItemIntegrationTest extends ApiIntegrationTestSupport {
  private static final String MISSING = "file-gone";

  @Autowired OperationStore operations;
  @Autowired OperationWorker worker;
  @Autowired CatalogStore catalog;
  @Autowired ProviderConnectionRepository connections;
  @MockitoBean CloudProviderClients clients;
  @MockitoBean ProviderRetryService retry;
  private CloudProviderClient remote;
  private ProviderConnectionEntity connection;
  private UUID user;

  @BeforeEach void setup() throws Exception {
    var registered = registerUser("missing_item", "password123", UUID.randomUUID()).path("data");
    user = UUID.fromString(registered.path("user").path("id").asText());
    connection = new ProviderConnectionEntity();
    connection.setUserId(user); connection.setProvider("onedrive"); connection.setAccountId("remote-account");
    connection.setEncryptedRefreshToken("unused"); connection.setConnectedAt(OffsetDateTime.now());
    connection = connections.saveAndFlush(connection);
    remote = mock(CloudProviderClient.class);
    when(clients.get(CloudProvider.ONEDRIVE)).thenReturn(remote);
    when(retry.withRetry(any(), any())).thenAnswer(call -> ((ProviderRetryService.TokenCall<?>) call.getArgument(1)).execute("fixture-token"));
  }

  private OperationDtos.Request request(String key, OperationDtos.Kind kind, String name) {
    return new OperationDtos.Request(key, "onedrive", connection.getId(), connection.getGeneration(), kind, MISSING, null, name, null, null, null);
  }
  private static ProviderApiException notFound() {
    return new ProviderApiException(HttpStatus.NOT_FOUND, "ITEM_NAO_ENCONTRADO", "Item não encontrado.");
  }
  private CloudItem gone() {
    return new CloudItem(MISSING, "onedrive", "Gone.txt", ItemKind.FILE, "text/plain", "txt", 8L,
        OffsetDateTime.now(), null, true, "etag-1", "content-1");
  }

  @Test void deleteOfItemAlreadyGoneSucceedsWithoutAnotherProviderDelete() {
    catalog.confirmed(connection, gone(), null);
    when(remote.get(anyString(), eq(MISSING))).thenThrow(notFound());
    var accepted = operations.accept(user, connection, request("delete-gone", OperationDtos.Kind.DELETE, null), null);

    worker.execute(accepted.id());

    var result = operations.get(accepted.id());
    assertThat(result.status()).isEqualTo("SUCCEEDED");
    assertThat(result.errorCode()).isNull();
    assertThat(result.result()).isNull();
    assertThat(catalog.entry(connection, MISSING).deleted()).isTrue();
    assertThat(catalog.folder(connection, null).items()).isEmpty();
    verify(remote, times(1)).get(anyString(), eq(MISSING));
    verify(remote, never()).delete(anyString(), anyString());
    verify(remote, never()).deleteConditional(anyString(), anyString(), any());
  }

  @Test void updateOfItemAlreadyGoneIsRejectedWithTheProviderCode() {
    when(remote.get(anyString(), eq(MISSING))).thenThrow(notFound());
    var accepted = operations.accept(user, connection, request("update-gone", OperationDtos.Kind.UPDATE, "Renamed.txt"), null);

    worker.execute(accepted.id());

    var result = operations.get(accepted.id());
    assertThat(result.status()).isEqualTo("REJECTED");
    assertThat(result.errorCode()).isEqualTo("ITEM_NAO_ENCONTRADO");
    assertThat(result.errorMessage()).isEqualTo("Item não encontrado.");
    verify(remote, never()).update(anyString(), anyString(), any(), any());
    verify(remote, never()).updateConditional(anyString(), anyString(), any(), any(), any());
  }

  @Test void deleteFailureThatIsNotNotFoundIsNotReportedAsDone() {
    when(remote.get(anyString(), eq(MISSING)))
        .thenThrow(new ProviderApiException(HttpStatus.SERVICE_UNAVAILABLE, "PROVEDOR_INDISPONIVEL", "Indisponível."));
    var accepted = operations.accept(user, connection, request("delete-unavailable", OperationDtos.Kind.DELETE, null), null);

    worker.execute(accepted.id());

    var result = operations.get(accepted.id());
    assertThat(result.status()).isEqualTo("QUEUED");
    assertThat(result.errorCode()).isEqualTo("PROVEDOR_INDISPONIVEL");
    verify(remote, never()).deleteConditional(anyString(), anyString(), any());
  }
}
