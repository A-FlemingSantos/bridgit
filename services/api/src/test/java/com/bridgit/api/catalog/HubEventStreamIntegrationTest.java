package com.bridgit.api.catalog;

import com.bridgit.api.ApiIntegrationTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MvcResult;

import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class HubEventStreamIntegrationTest extends ApiIntegrationTestSupport {
  @MockitoSpyBean CatalogStore catalog;

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
  void anOpenStreamNudgesTheUsersConnections() throws Exception {
    var registered = registerUser("stream_nudge", "password123", UUID.randomUUID()).path("data");
    UUID user = UUID.fromString(registered.path("user").path("id").asText());
    MvcResult stream = mockMvc.perform(get("/api/hub/events/stream")
            .header("Authorization", "Bearer " + registered.path("accessToken").asText()))
        .andExpect(status().isOk()).andExpect(request().asyncStarted()).andReturn();
    stream.getAsyncResult(30_000);
    verify(catalog, atLeastOnce()).nudgeUser(user);
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
