package com.bridgit.api.account;

import com.bridgit.api.ApiIntegrationTestSupport;
import com.bridgit.api.auth.UserRepository;
import com.bridgit.api.catalog.HubEventStore;
import com.bridgit.api.integrations.*;
import com.bridgit.api.operations.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@TestPropertySource(properties = {"app.hub.worker-enabled=false", "app.hub.upload-cleanup-poll-ms=3600000"})
class AccountDeletionIntegrationTest extends ApiIntegrationTestSupport {
  private static final Path DIRECTORY = Path.of(System.getProperty("java.io.tmpdir"), "bridgit-account-cleanup-" + UUID.randomUUID());
  @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
    registry.add("app.hub.upload-directory", DIRECTORY::toString);
  }
  @Autowired OperationStore operations;
  @Autowired UploadPayloadStore payloads;
  @Autowired UploadCleanupService cleanup;
  @Autowired AccountDeletionService deletion;
  @Autowired UserRepository users;
  @Autowired ProviderConnectionRepository connections;
  @Autowired HubEventStore events;
  @Autowired JdbcTemplate jdbc;
  @Autowired PlatformTransactionManager transactions;

  private record Fixture(UUID user, String token, ProviderConnectionEntity connection, OperationStore.Stored operation) {}
  private Fixture fixture(String username) throws Exception {
    var registered = registerUser(username, "password123", UUID.randomUUID()).path("data");
    UUID user = UUID.fromString(registered.path("user").path("id").asText());
    var connection = new ProviderConnectionEntity();
    connection.setUserId(user); connection.setProvider("onedrive"); connection.setAccountId("remote-account");
    connection.setEncryptedRefreshToken("unused"); connection.setConnectedAt(OffsetDateTime.now());
    connection = connections.saveAndFlush(connection);
    var payload = payloads.receive(new ByteArrayResource(new byte[]{1, 2, 3}), 3);
    var request = new OperationDtos.Request(UUID.randomUUID().toString(), "onedrive", connection.getId(),
        connection.getGeneration(), OperationDtos.Kind.UPLOAD, null, null, "File.txt", "text/plain", null, null);
    var operation = operations.accept(user, connection, request, payload);
    return new Fixture(user, registered.path("accessToken").asText(), connection, operation);
  }
  private long count(String table, UUID user) {
    return jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE user_id=?", Long.class, user.toString());
  }

  @Test void deletionRemovesOperationsEventsAndUploadsWithoutWorkerAndPreservesOtherUsers() throws Exception {
    var deleted = fixture("delete_owner");
    var other = fixture("keep_owner");
    events.append(deleted.user(), deleted.connection().getId(), 1, "fixture", "private payload");
    assertThat(count("cloud_events", deleted.user())).isGreaterThan(0);
    mockMvc.perform(delete("/api/account").header("Authorization", "Bearer " + deleted.token()))
        .andExpect(status().isOk());
    assertThat(users.existsById(deleted.user())).isFalse();
    assertThat(count("cloud_operations", deleted.user())).isZero();
    assertThat(count("cloud_events", deleted.user())).isZero();
    assertThat(DIRECTORY.resolve(deleted.operation().payload().path())).doesNotExist();
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM upload_cleanup_queue", Long.class)).isZero();
    assertThat(users.existsById(other.user())).isTrue();
    assertThat(count("cloud_operations", other.user())).isEqualTo(1);
    assertThat(count("cloud_events", other.user())).isGreaterThan(0);
    assertThat(DIRECTORY.resolve(other.operation().payload().path())).exists();
    payloads.remove(other.operation().payload());
  }

  @Test void rollbackKeepsUserOperationsEventsAndPayloadIntact() throws Exception {
    var fixture = fixture("rollback_owner");
    new TransactionTemplate(transactions).executeWithoutResult(tx -> {
      deletion.delete(users.findById(fixture.user()).orElseThrow());
      tx.setRollbackOnly();
    });
    assertThat(users.existsById(fixture.user())).isTrue();
    assertThat(count("cloud_operations", fixture.user())).isEqualTo(1);
    assertThat(count("cloud_events", fixture.user())).isGreaterThan(0);
    assertThat(DIRECTORY.resolve(fixture.operation().payload().path())).exists();
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM upload_cleanup_queue", Long.class)).isZero();
    payloads.remove(fixture.operation().payload());
  }

  @Test void committedCleanupSurvivesInterruptionBeforeFilesystemRemoval() throws Exception {
    var fixture = fixture("recover_owner");
    deletion.delete(users.findById(fixture.user()).orElseThrow());
    assertThat(DIRECTORY.resolve(fixture.operation().payload().path())).exists();
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM upload_cleanup_queue", Long.class)).isEqualTo(1);
    cleanup.resume();
    assertThat(DIRECTORY.resolve(fixture.operation().payload().path())).doesNotExist();
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM upload_cleanup_queue", Long.class)).isZero();
    assertThatThrownBy(() -> operations.accept(fixture.user(), fixture.connection(), fixture.operation().request(), null))
        .isInstanceOf(com.bridgit.api.common.error.UnauthorizedException.class);
    assertThatThrownBy(() -> events.append(fixture.user(), fixture.connection().getId(), 1, "late", "payload"))
        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    assertThat(count("cloud_operations", fixture.user())).isZero();
    assertThat(count("cloud_events", fixture.user())).isZero();
  }

  @Test void filesystemFailureRetainsDurableCleanupForRetry() throws Exception {
    Path blocked = DIRECTORY.resolve(UUID.randomUUID() + ".upload");
    Files.createDirectories(blocked);
    Path child = Files.write(blocked.resolve("busy"), new byte[]{1});
    jdbc.update("INSERT INTO upload_cleanup_queue(payload_path) VALUES(?)", blocked.getFileName().toString());
    cleanup.resume();
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM upload_cleanup_queue", Long.class)).isEqualTo(1);
    Files.delete(child);
    cleanup.resume();
    assertThat(blocked).doesNotExist();
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM upload_cleanup_queue", Long.class)).isZero();
  }

  @Test void accountDeletionSucceedsEvenWhenFilesystemCleanupMustBeRetried() throws Exception {
    var fixture = fixture("blocked_owner");
    Path blocked = DIRECTORY.resolve(fixture.operation().payload().path());
    Files.delete(blocked);
    Files.createDirectory(blocked);
    Path child = Files.write(blocked.resolve("busy"), new byte[]{1});
    try {
      mockMvc.perform(delete("/api/account").header("Authorization", "Bearer " + fixture.token()))
          .andExpect(status().isOk());
      assertThat(users.existsById(fixture.user())).isFalse();
      assertThat(count("cloud_operations", fixture.user())).isZero();
      assertThat(count("cloud_events", fixture.user())).isZero();
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM upload_cleanup_queue", Long.class)).isEqualTo(1);
    } finally { Files.deleteIfExists(child); }
    cleanup.resume();
    assertThat(blocked).doesNotExist();
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM upload_cleanup_queue", Long.class)).isZero();
  }
}
