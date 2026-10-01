package com.bridgit.api.operations;

import com.bridgit.api.catalog.LocalHubProperties;
import com.bridgit.api.common.error.ApiException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ByteArrayResource;
import static org.assertj.core.api.Assertions.*;

class UploadPayloadStoreTest {
  @TempDir Path directory;
  private UploadPayloadStore store() {
    LocalHubProperties properties = new LocalHubProperties();
    properties.setUploadDirectory(directory.toString());
    return new UploadPayloadStore(properties);
  }
  @Test void acknowledgedPayloadCanBeReopenedAfterReconstructingTheStore() throws Exception {
    byte[] bytes = {0, 1, 2, 3, (byte) 255};
    OperationStore.Payload payload = store().receive(new ByteArrayResource(bytes), bytes.length);
    try (var first = store().verified(payload).getInputStream(); var retry = store().verified(payload).getInputStream()) {
      assertThat(first.readAllBytes()).isEqualTo(bytes);
      assertThat(retry.readAllBytes()).isEqualTo(bytes);
    }
    store().remove(payload);
    assertThat(directory.resolve(payload.path())).doesNotExist();
  }
  @Test void incompleteReceiptNeverPublishesAReadyFile() throws Exception {
    assertThatThrownBy(() -> store().receive(new ByteArrayResource(new byte[]{1}), 2)).isInstanceOf(ApiException.class);
    try (var files = Files.list(directory)) { assertThat(files.toList()).isEmpty(); }
  }
  @Test void alteredOrMissingBytesAreNeverSentAsSuccessfulRetries() throws Exception {
    var payload = store().receive(new ByteArrayResource(new byte[]{1, 2}), 2);
    Files.write(directory.resolve(payload.path()), new byte[]{3, 4});
    assertThatThrownBy(() -> store().verified(payload)).isInstanceOf(ApiException.class);
    Files.delete(directory.resolve(payload.path()));
    assertThatThrownBy(() -> store().verified(payload)).isInstanceOf(ApiException.class);
  }
  @Test void payloadReferencesCannotEscapeTheConfiguredDirectory() {
    var forged = new OperationStore.Payload("../outside", 0, "invalid");
    assertThatThrownBy(() -> store().verified(forged)).isInstanceOf(IllegalArgumentException.class);
  }
}
