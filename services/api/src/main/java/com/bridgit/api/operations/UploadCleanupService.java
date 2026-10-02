package com.bridgit.api.operations;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Filesystem cleanup has its own durable queue, independent of the operation worker. */
@Service
public class UploadCleanupService {
  private static final Logger log = LoggerFactory.getLogger(UploadCleanupService.class);
  private final JdbcTemplate jdbc;
  private final UploadPayloadStore payloads;

  public UploadCleanupService(JdbcTemplate jdbc, UploadPayloadStore payloads) {
    this.jdbc = jdbc;
    this.payloads = payloads;
  }

  public void remove(List<String> paths) {
    for (String path : paths) {
      payloads.remove(new OperationStore.Payload(path, 0, null));
      jdbc.update("DELETE FROM upload_cleanup_queue WHERE payload_path=?", path);
    }
  }

  /** A committed account deletion remains successful if filesystem cleanup must be retried. */
  public void complete(List<String> paths) {
    for (String path : paths) {
      try { remove(List.of(path)); }
      catch (RuntimeException ex) { log.warn("Account upload cleanup deferred"); }
    }
  }

  @Scheduled(fixedDelayString = "${app.hub.upload-cleanup-poll-ms:5000}")
  public void resume() {
    List<String> paths = jdbc.query("SELECT TOP (100) payload_path FROM upload_cleanup_queue",
        (rs, row) -> rs.getString(1));
    for (String path : paths) {
      try { remove(List.of(path)); }
      catch (RuntimeException ex) { log.warn("Account upload cleanup deferred"); }
    }
  }
}
