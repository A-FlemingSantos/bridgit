package com.bridgit.api.operations;

import com.bridgit.api.ApiIntegrationTestSupport;
import com.bridgit.api.catalog.CatalogStore;
import com.bridgit.api.catalog.ReadAuthorizationService;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionRepository;
import com.bridgit.api.integrations.ProviderRetryService;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClient;
import com.bridgit.api.providers.CloudProviderClients;
import com.bridgit.api.providers.ContentStream;
import com.bridgit.api.providers.ContentVariant;
import com.bridgit.api.providers.ItemKind;
import com.bridgit.api.providers.ProviderApiException;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** REPLACE_CONTENT: conditional write of a text file through the journal, and the verification of ambiguous outcomes. */
@TestPropertySource(properties = {"app.hub.catalog-enabled=true", "app.hub.operations-enabled=true",
    "app.hub.worker-enabled=false", "app.hub.direct-read-enabled=false"})
class ReplaceContentOperationIntegrationTest extends ApiIntegrationTestSupport {
  private static final Path DIRECTORY = Path.of(System.getProperty("java.io.tmpdir"), "bridgit-replace-" + UUID.randomUUID());
  private static final String REF = "text-1";
  private static final byte[] NEW_BYTES = "new text".getBytes(StandardCharsets.UTF_8);

  @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
    registry.add("app.hub.upload-directory", DIRECTORY::toString);
  }

  @Autowired OperationStore operations;
  @Autowired OperationWorker worker;
  @Autowired UploadPayloadStore payloads;
  @Autowired CatalogStore catalog;
  @Autowired ProviderConnectionRepository connections;
  @MockitoBean CloudProviderClients clients;
  @MockitoBean ProviderRetryService retry;
  @MockitoSpyBean ReadAuthorizationService readAuthorization;
  private CloudProviderClient remote;
  private ProviderConnectionEntity connection;
  private UUID user;

  @BeforeEach void setup() throws Exception {
    var registered = registerUser("replace_content", "password123", UUID.randomUUID()).path("data");
    user = UUID.fromString(registered.path("user").path("id").asText());
    connection = new ProviderConnectionEntity();
    connection.setUserId(user); connection.setProvider("onedrive"); connection.setAccountId("remote-account");
    connection.setEncryptedRefreshToken("unused"); connection.setConnectedAt(OffsetDateTime.now());
    connection = connections.saveAndFlush(connection);
    remote = mock(CloudProviderClient.class);
    when(clients.get(CloudProvider.ONEDRIVE)).thenReturn(remote);
    when(retry.withRetry(any(), any())).thenAnswer(call -> ((ProviderRetryService.TokenCall<?>) call.getArgument(1)).execute("fixture-token"));
  }
  @AfterEach void removeFixtureFiles() throws Exception {
    if (Files.exists(DIRECTORY)) try (var files = Files.list(DIRECTORY)) {
      for (Path path : files.toList()) Files.deleteIfExists(path);
    }
  }

  private CloudItem item(Long size, String etag, String ctag, String parent, boolean parentKnown) {
    return new CloudItem(REF, "onedrive", "a.txt", ItemKind.FILE, "text/plain", "txt", size, OffsetDateTime.now(),
        parent, parentKnown, etag, ctag);
  }
  private CloudItem base() { return item(5L, "etag-1", "c1", "folder-1", true); }
  private OperationStore.Stored accept(String key, String expectedVersion) {
    var request = new OperationDtos.Request(key, "onedrive", connection.getId(), connection.getGeneration(),
        OperationDtos.Kind.REPLACE_CONTENT, REF, null, null, null, expectedVersion, null);
    return operations.accept(user, connection, request, payloads.receive(new ByteArrayResource(NEW_BYTES), NEW_BYTES.length));
  }
  private static ContentStream stream(byte[] bytes) {
    return new ContentStream(new ByteArrayInputStream(bytes), "text/plain", (long) bytes.length, "a.txt");
  }
  /** Runs the operation until the provider call "gets lost", leaving it in VERIFYING with the base persisted. */
  private OperationStore.Stored ambiguous(String key) {
    when(remote.get(anyString(), eq(REF))).thenReturn(base());
    when(remote.replaceContent(anyString(), eq(REF), anyString(), anyLong(), any(), any()))
        .thenThrow(new ProviderApiException("response lost"));
    var accepted = accept(key, "c1");
    worker.execute(accepted.id());
    assertThat(operations.get(accepted.id()).status()).isEqualTo("VERIFYING");
    return operations.get(accepted.id());
  }

  @Test void successWritesWithFreshProviderVersionOverlaysTheParentAndInvalidatesTheReadCache() {
    when(remote.get(anyString(), eq(REF))).thenReturn(base());
    when(remote.replaceContent(anyString(), eq(REF), anyString(), anyLong(), any(), any()))
        .thenReturn(item((long) NEW_BYTES.length, "etag-2", "c2", null, false));
    var accepted = accept("replace-ok", "c1");

    worker.execute(accepted.id());

    var result = operations.get(accepted.id());
    assertThat(result.status()).isEqualTo("SUCCEEDED");
    assertThat(result.result().contentRevision()).isEqualTo("c2");
    assertThat(result.result().parentRef()).isEqualTo("folder-1");
    assertThat(result.result().parentKnown()).isTrue();
    var entry = catalog.entry(connection, REF);
    assertThat(entry.item().contentRevision()).isEqualTo("c2");
    assertThat(entry.item().parentRef()).isEqualTo("folder-1");
    verify(remote).replaceContent(eq("fixture-token"), eq(REF), eq("text/plain"), eq((long) NEW_BYTES.length), any(), eq("etag-1"));
    verify(readAuthorization).invalidate(connection.getId(), REF);
  }

  @Test void missingRevisionInTheWriteResponseIsReadAgain() {
    when(remote.get(anyString(), eq(REF))).thenReturn(base(), item((long) NEW_BYTES.length, "etag-2", "c2", "folder-1", true));
    when(remote.replaceContent(anyString(), eq(REF), anyString(), anyLong(), any(), any()))
        .thenReturn(item((long) NEW_BYTES.length, "etag-2", null, null, false));
    var accepted = accept("replace-reget", "c1");

    worker.execute(accepted.id());

    var result = operations.get(accepted.id());
    assertThat(result.status()).isEqualTo("SUCCEEDED");
    assertThat(result.result().contentRevision()).isEqualTo("c2");
    assertThat(result.result().parentRef()).isEqualTo("folder-1");
  }

  @Test void revisionMismatchIsRejectedWithoutCallingTheProvider() {
    when(remote.get(anyString(), eq(REF))).thenReturn(item(5L, "etag-9", "c9", "folder-1", true));
    var accepted = accept("replace-stale", "c1");

    worker.execute(accepted.id());

    var result = operations.get(accepted.id());
    assertThat(result.status()).isEqualTo("REJECTED");
    assertThat(result.errorCode()).isEqualTo("ARQUIVO_ALTERADO");
    verify(remote, never()).replaceContent(anyString(), anyString(), anyString(), anyLong(), any(), any());
  }

  @Test void nonEditableBaseIsRejected() {
    when(remote.get(anyString(), eq(REF))).thenReturn(item(3L * 1024 * 1024, "etag-1", "c1", "folder-1", true));
    var accepted = accept("replace-big-base", "c1");

    worker.execute(accepted.id());

    var result = operations.get(accepted.id());
    assertThat(result.status()).isEqualTo("REJECTED");
    assertThat(result.errorCode()).isEqualTo("EDICAO_INDISPONIVEL");
    verify(remote, never()).replaceContent(anyString(), anyString(), anyString(), anyLong(), any(), any());
  }

  @Test void missingFileIsRejectedAsNotFound() {
    when(remote.get(anyString(), eq(REF)))
        .thenThrow(new ProviderApiException(HttpStatus.NOT_FOUND, "ITEM_NAO_ENCONTRADO", "Item não encontrado."));
    var accepted = accept("replace-gone", "c1");

    worker.execute(accepted.id());

    var result = operations.get(accepted.id());
    assertThat(result.status()).isEqualTo("REJECTED");
    assertThat(result.errorCode()).isEqualTo("ITEM_NAO_ENCONTRADO");
    verify(remote, never()).replaceContent(anyString(), anyString(), anyString(), anyLong(), any(), any());
  }

  @Test void providerConflictIsRejected() {
    when(remote.get(anyString(), eq(REF))).thenReturn(base());
    when(remote.replaceContent(anyString(), eq(REF), anyString(), anyLong(), any(), any()))
        .thenThrow(new ProviderApiException(HttpStatus.CONFLICT, "ARQUIVO_ALTERADO", "changed"));
    var accepted = accept("replace-412", "c1");

    worker.execute(accepted.id());

    assertThat(operations.get(accepted.id()).status()).isEqualTo("REJECTED");
    assertThat(operations.get(accepted.id()).errorCode()).isEqualTo("ARQUIVO_ALTERADO");
  }

  @Test void verifySucceedsWhenTheCloudAlreadyHoldsThePayload() {
    var pending = ambiguous("replace-verify-ok");
    when(remote.get(anyString(), eq(REF))).thenReturn(item((long) NEW_BYTES.length, "etag-2", "c2", null, false));
    when(remote.open(anyString(), any(), eq(ContentVariant.ORIGINAL))).thenReturn(stream(NEW_BYTES));

    worker.execute(pending.id());

    var result = operations.get(pending.id());
    assertThat(result.status()).isEqualTo("SUCCEEDED");
    assertThat(result.result().contentRevision()).isEqualTo("c2");
    assertThat(result.result().parentRef()).isEqualTo("folder-1");
    assertThat(result.result().parentKnown()).isTrue();
    verify(readAuthorization).invalidate(connection.getId(), REF);
    verify(remote, times(1)).replaceContent(anyString(), anyString(), anyString(), anyLong(), any(), any());
  }

  @Test void verifyRequeuesWhenSameSizeButOtherBytesAndRevisionUnchanged() {
    var pending = ambiguous("replace-verify-requeue");
    byte[] other = "NEW TEXT".getBytes(StandardCharsets.UTF_8);
    when(remote.get(anyString(), eq(REF))).thenReturn(item((long) NEW_BYTES.length, "etag-1", "c1", "folder-1", true));
    when(remote.open(anyString(), any(), eq(ContentVariant.ORIGINAL))).thenReturn(stream(other));

    worker.execute(pending.id());

    assertThat(operations.get(pending.id()).status()).isEqualTo("QUEUED");
    verify(remote, times(1)).replaceContent(anyString(), anyString(), anyString(), anyLong(), any(), any());
  }

  @Test void verifyRejectsWhenTheRevisionMovedToSomethingElse() {
    var pending = ambiguous("replace-verify-moved");
    when(remote.get(anyString(), eq(REF))).thenReturn(item(9L, "etag-7", "c7", "folder-1", true));

    worker.execute(pending.id());

    var result = operations.get(pending.id());
    assertThat(result.status()).isEqualTo("REJECTED");
    assertThat(result.errorCode()).isEqualTo("ARQUIVO_ALTERADO");
    verify(remote, never()).open(anyString(), any(), any(ContentVariant.class));
  }

  @Test void verifyRejectsWhenTheFileIsGone() {
    var pending = ambiguous("replace-verify-gone");
    when(remote.get(anyString(), eq(REF)))
        .thenThrow(new ProviderApiException(HttpStatus.NOT_FOUND, "ITEM_NAO_ENCONTRADO", "Item não encontrado."));

    worker.execute(pending.id());

    var result = operations.get(pending.id());
    assertThat(result.status()).isEqualTo("REJECTED");
    assertThat(result.errorCode()).isEqualTo("ITEM_NAO_ENCONTRADO");
    assertThat(result.errorMessage()).isEqualTo("O arquivo não existe mais na nuvem.");
  }
}
