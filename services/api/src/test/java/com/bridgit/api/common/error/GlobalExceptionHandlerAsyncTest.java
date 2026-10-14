package com.bridgit.api.common.error;

import java.sql.SQLException;
import java.time.Clock;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class GlobalExceptionHandlerAsyncTest {
  private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new DisconnectedResponseController())
      .setControllerAdvice(new GlobalExceptionHandler(Clock.systemUTC())).build();

  @Test
  void unusableAsyncResponseDoesNotBecomeAJsonInternalError() throws Exception {
    mvc.perform(get("/disconnected")).andExpect(status().isOk())
        .andExpect(content().string(""));
  }

  @Test
  void uniqueViolationIsAConflict() throws Exception {
    mvc.perform(get("/duplicate")).andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("CONFLITO_DADOS"));
  }

  @Test
  void truncationKeepsTheLimitMessage() throws Exception {
    mvc.perform(get("/truncated")).andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("DADOS_INVALIDOS"))
        .andExpect(jsonPath("$.error.message").value("Os dados enviados excedem os limites permitidos."));
  }

  @Test
  void unrelatedFailuresStillProduceAnInternalError() throws Exception {
    mvc.perform(get("/failure")).andExpect(status().isInternalServerError())
        .andExpect(jsonPath("$.error.code").value("ERRO_INTERNO"));
  }

  @RestController
  static class DisconnectedResponseController {
    @GetMapping("/disconnected") public void disconnected() throws AsyncRequestNotUsableException {
      throw new AsyncRequestNotUsableException("Response no longer usable");
    }
    @GetMapping("/duplicate") public void duplicate() {
      throw new DataIntegrityViolationException("dup", new SQLException("duplicate", "23000", 2627));
    }
    @GetMapping("/truncated") public void truncated() {
      throw new DataIntegrityViolationException("long", new SQLException("truncated", "22001", 2628));
    }
    @GetMapping("/failure") public void failure() {
      throw new IllegalStateException("Database unavailable");
    }
  }
}
