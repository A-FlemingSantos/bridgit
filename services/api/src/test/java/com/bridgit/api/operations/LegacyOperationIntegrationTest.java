package com.bridgit.api.operations;

import com.bridgit.api.ApiIntegrationTestSupport;
import com.bridgit.api.catalog.ConnectionWork;
import com.bridgit.api.integrations.*;
import com.bridgit.api.providers.*;
import com.bridgit.api.providers.sync.PreparedWrite;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.concurrent.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@TestPropertySource(properties = {"app.hub.catalog-enabled=true", "app.hub.operations-enabled=true", "app.hub.worker-enabled=false"})
class LegacyOperationIntegrationTest extends ApiIntegrationTestSupport {
  private static final Path DIRECTORY = Path.of(System.getProperty("java.io.tmpdir"), "bridgit-legacy-" + UUID.randomUUID());
  @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
    registry.add("app.hub.upload-directory", DIRECTORY::toString);
  }
  @Autowired OperationStore operations;
  @Autowired OperationWorker worker;
  @Autowired UploadPayloadStore payloads;
  @Autowired ConnectionWork work;
  @Autowired ProviderConnectionRepository connections;
  @Autowired JdbcTemplate jdbc;
  @MockitoBean CloudProviderClients clients;
  @MockitoBean ProviderRetryService retry;
  private CloudProviderClient remote;
  private ProviderConnectionEntity connection;
  private UUID user;
  private String token;

  @BeforeEach void setup() throws Exception {
    var registered = registerUser("legacy_user", "password123", UUID.randomUUID()).path("data");
    user = UUID.fromString(registered.path("user").path("id").asText());
    token = registered.path("accessToken").asText();
    connection = new ProviderConnectionEntity();
    connection.setUserId(user); connection.setProvider("onedrive"); connection.setAccountId("remote-account");
    connection.setEncryptedRefreshToken("unused"); connection.setConnectedAt(OffsetDateTime.now());
    connection = connections.saveAndFlush(connection);
    remote = mock(CloudProviderClient.class);
    when(clients.get(CloudProvider.ONEDRIVE)).thenReturn(remote);
    when(retry.withRetry(any(), any())).thenAnswer(call -> ((ProviderRetryService.TokenCall<?>) call.getArgument(1)).execute("fixture-token"));
    when(remote.prepareCreate(anyString())).thenReturn(new PreparedWrite("remote-id", null));
  }
  @AfterEach void removeFixtureFiles() throws Exception {
    if (Files.exists(DIRECTORY)) try (var files = Files.list(DIRECTORY)) {
      for (Path path : files.toList()) Files.deleteIfExists(path);
    }
  }
  private CloudItem folder() {
    return new CloudItem("remote-id", "onedrive", "Folder", ItemKind.FOLDER, null, null, null, null, null, true);
  }
  private long operationCount() {
    return jdbc.queryForObject("SELECT COUNT(*) FROM cloud_operations WHERE user_id=?", Long.class, user.toString());
  }
  private void create(String key, int expectedStatus) throws Exception {
    mockMvc.perform(post("/api/providers/onedrive/folders")
        .header("Authorization", "Bearer " + token).header("Idempotency-Key", key)
        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Folder\"}"))
        .andExpect(status().is(expectedStatus));
  }
  private void upload(String key, byte[] bytes, int expectedStatus) throws Exception {
    mockMvc.perform(multipart("/api/providers/onedrive/files")
        .file(new MockMultipartFile("file", "File.txt", "text/plain", bytes))
        .header("Authorization", "Bearer " + token).header("Idempotency-Key", key))
        .andExpect(status().is(expectedStatus));
  }
  private void withBusyConnection(Callable<Void> scenario) throws Exception {
    CountDownLatch held = new CountDownLatch(1), release = new CountDownLatch(1);
    try (var thread = Executors.newSingleThreadExecutor()) {
      var holding = thread.submit(() -> {
        var lock = work.lock(connection.getId());
        lock.lock();
        try { held.countDown(); release.await(); }
        catch (InterruptedException ex) { Thread.currentThread().interrupt(); }
        finally { lock.unlock(); }
      });
      try {
        assertThat(held.await(5, TimeUnit.SECONDS)).isTrue();
        scenario.call();
      } finally { release.countDown(); holding.get(5, TimeUnit.SECONDS); }
    }
  }

  @Test void missingOrInvalidKeyRejectsAllLegacyWritesBeforeAcceptance() throws Exception {
    mockMvc.perform(post("/api/providers/onedrive/folders").header("Authorization", "Bearer " + token)
        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Folder\"}"))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("IDEMPOTENCIA_OBRIGATORIA"));
    mockMvc.perform(multipart("/api/providers/onedrive/files").file(new MockMultipartFile("file", "File.txt", "text/plain", new byte[]{1}))
        .header("Authorization", "Bearer " + token)).andExpect(status().isBadRequest());
    mockMvc.perform(patch("/api/providers/onedrive/items/item").header("Authorization", "Bearer " + token)
        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"New.txt\"}"))
        .andExpect(status().isBadRequest());
    mockMvc.perform(delete("/api/providers/onedrive/items/item").header("Authorization", "Bearer " + token))
        .andExpect(status().isBadRequest());
    create(" ", 400); create("x".repeat(101), 400);
    assertThat(operationCount()).isZero();
    if (Files.exists(DIRECTORY)) try (var files = Files.list(DIRECTORY)) { assertThat(files.toList()).isEmpty(); }
    verifyNoInteractions(remote);
  }

  @Test void contendedFolderRetriesCreateOneOperationAndOneRemoteWrite() throws Exception {
    when(remote.createFolderPrepared(anyString(), any(), anyString(), any())).thenReturn(folder());
    withBusyConnection(() -> {
      create("folder-action", 503); create("folder-action", 503);
      assertThat(operationCount()).isEqualTo(1);
      verify(remote, never()).createFolderPrepared(anyString(), any(), anyString(), any());
      return null;
    });
    worker.execute(operations.byClientKey(user, "folder-action").id());
    create("folder-action", 200);
    assertThat(operationCount()).isEqualTo(1);
    verify(remote, times(1)).createFolderPrepared(anyString(), any(), anyString(), any());
    create("another-action", 200);
    assertThat(operationCount()).isEqualTo(2);
    verify(remote, times(2)).createFolderPrepared(anyString(), any(), anyString(), any());
  }

  @Test void ambiguousFolderResponseIsVerifiedWithoutAnotherRemoteCreate() throws Exception {
    when(remote.createFolderPrepared(anyString(), any(), anyString(), any())).thenThrow(new ProviderApiException("response lost"));
    when(remote.get(anyString(), eq("remote-id"))).thenReturn(folder());
    create("ambiguous-action", 503);
    assertThat(operations.byClientKey(user, "ambiguous-action").status()).isEqualTo("VERIFYING");
    create("ambiguous-action", 200);
    assertThat(operationCount()).isEqualTo(1);
    verify(remote, times(1)).createFolderPrepared(anyString(), any(), anyString(), any());
    verify(remote, times(1)).get(anyString(), eq("remote-id"));
  }

  @Test void contendedUploadRetriesKeepOnePayloadAndWriteOnceEvenAfterPayloadCleanup() throws Exception {
    byte[] bytes = {1, 2, 3};
    var file = new CloudItem("remote-id", "onedrive", "File.txt", ItemKind.FILE, "text/plain", "txt", 3L, null, null, true);
    when(remote.uploadPrepared(anyString(), any(), anyString(), anyString(), anyLong(), any(), any())).thenReturn(file);
    withBusyConnection(() -> {
      upload("upload-action", bytes, 503); upload("upload-action", bytes, 503);
      assertThat(operationCount()).isEqualTo(1);
      try (var files = Files.list(DIRECTORY)) { assertThat(files.toList()).hasSize(1); }
      return null;
    });
    var accepted = operations.byClientKey(user, "upload-action");
    worker.execute(accepted.id());
    payloads.remove(accepted.payload()); operations.payloadRemoved(accepted.id());
    upload("upload-action", bytes, 200);
    assertThat(operationCount()).isEqualTo(1);
    try (var files = Files.list(DIRECTORY)) { assertThat(files.toList()).isEmpty(); }
    verify(remote, times(1)).uploadPrepared(anyString(), any(), anyString(), anyString(), anyLong(), any(), any());
    upload("upload-action", new byte[]{4, 5, 6}, 409);
    assertThat(operationCount()).isEqualTo(1);
    try (var files = Files.list(DIRECTORY)) { assertThat(files.toList()).isEmpty(); }
  }

  @Test void keyCannotBeReusedForAnotherRequest() throws Exception {
    when(remote.createFolderPrepared(anyString(), any(), anyString(), any())).thenReturn(folder());
    create("same-key", 200);
    mockMvc.perform(post("/api/providers/onedrive/folders").header("Authorization", "Bearer " + token)
        .header("Idempotency-Key", "same-key").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Other\"}"))
        .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("OPERACAO_DIFERENTE"));
    assertThat(operationCount()).isEqualTo(1);
    verify(remote, times(1)).createFolderPrepared(anyString(), any(), anyString(), any());
  }

  @Test void corsPreflightAllowsIdempotencyHeader() throws Exception {
    mockMvc.perform(options("/api/providers/onedrive/folders").header("Origin", "http://localhost:5173")
        .header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "Idempotency-Key,Content-Type"))
        .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Headers", org.hamcrest.Matchers.containsString("Idempotency-Key")));
  }
}
