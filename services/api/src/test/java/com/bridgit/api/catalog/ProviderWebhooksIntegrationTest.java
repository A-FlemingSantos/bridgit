package com.bridgit.api.catalog;

import com.bridgit.api.ApiIntegrationTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Graph validates a subscription with a text/plain POST; anything but the echoed token keeps the watch from being created. */
class ProviderWebhooksIntegrationTest extends ApiIntegrationTestSupport {

  @Test void graphValidationWithTextPlainEchoesTheToken() throws Exception {
    mockMvc.perform(post("/api/webhooks/onedrive/" + UUID.randomUUID())
            .param("validationToken", "Validation: Token 1")
            .contentType("text/plain; charset=utf-8").accept(MediaType.TEXT_PLAIN).content(""))
        .andExpect(status().isOk())
        .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_PLAIN))
        .andExpect(content().string("Validation: Token 1"));
  }

  @Test void graphNotificationWithJsonIsAccepted() throws Exception {
    mockMvc.perform(post("/api/webhooks/onedrive/" + UUID.randomUUID())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"value\":[{\"subscriptionId\":\"unknown\",\"clientState\":\"unknown\"}]}"))
        .andExpect(status().isAccepted());
  }

  @Test void graphNotificationThatIsNotJsonIsRejected() throws Exception {
    mockMvc.perform(post("/api/webhooks/onedrive/" + UUID.randomUUID())
            .contentType(MediaType.APPLICATION_JSON).content("{not json"))
        .andExpect(status().isBadRequest());
  }

  @Test void unsupportedMediaTypeIsReportedAsSuchAndNotAsUnauthorized() throws Exception {
    mockMvc.perform(post("/api/auth/login").contentType(MediaType.TEXT_PLAIN).content("x"))
        .andExpect(status().isUnsupportedMediaType())
        .andExpect(jsonPath("$.error.code").value("TIPO_NAO_SUPORTADO"));
  }
}
