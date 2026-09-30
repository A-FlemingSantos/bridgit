package com.bridgit.api.catalog;

import com.bridgit.api.ApiIntegrationTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class HubEventStreamIntegrationTest extends ApiIntegrationTestSupport {
  @Test
  void authenticatedStreamClosesWithoutLosingAuthenticationOnAsyncDispatch() throws Exception {
    String token = registerUser("stream_user", "password123", UUID.randomUUID())
        .path("data").path("accessToken").asText();
    MvcResult stream = mockMvc.perform(get("/api/hub/events/stream")
            .header("Authorization", "Bearer " + token))
        .andExpect(status().isOk()).andExpect(request().asyncStarted()).andReturn();
    stream.getAsyncResult(30_000);
    MvcResult completed = mockMvc.perform(asyncDispatch(stream))
        .andExpect(status().isOk()).andReturn();
    assertThat(completed.getResponse().getContentAsString()).contains(": heartbeat\n\n")
        .doesNotContain("AUTENTICACAO_OBRIGATORIA");
  }

  @Test
  void anonymousRequestCannotStartAnEventStream() throws Exception {
    mockMvc.perform(get("/api/hub/events/stream"))
        .andExpect(status().isUnauthorized()).andExpect(request().asyncNotStarted());
  }

  @Test
  void invalidTokenCannotStartAnEventStream() throws Exception {
    mockMvc.perform(get("/api/hub/events/stream").header("Authorization", "Bearer invalid"))
        .andExpect(status().isUnauthorized()).andExpect(request().asyncNotStarted());
  }
}
