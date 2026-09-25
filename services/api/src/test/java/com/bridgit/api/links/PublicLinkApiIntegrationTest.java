package com.bridgit.api.links;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bridgit.api.ApiIntegrationTestSupport;
import com.bridgit.api.hub.FakeOneDriveClient;
import com.bridgit.api.hub.HubTestCloudProviderConfig;
import com.bridgit.api.integrations.IntegrationTokenCipher;
import com.bridgit.api.integrations.MicrosoftOAuthClient;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionRepository;
import com.bridgit.api.integrations.TokenResult;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.ContentVariant;
import com.bridgit.api.providers.ReadMode;
import com.bridgit.api.providers.ReadPlan;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@Import(HubTestCloudProviderConfig.class)
class PublicLinkApiIntegrationTest extends ApiIntegrationTestSupport {

  @Autowired
  private FakeOneDriveClient fakeOneDriveClient;

  @Autowired
  private ProviderConnectionRepository connectionRepository;

  @Autowired
  private PublicLinkRepository publicLinkRepository;

  @Autowired
  private IntegrationTokenCipher tokenCipher;

  @MockitoBean
  private MicrosoftOAuthClient microsoftOAuthClient;

  private String accessToken;
  private UUID userId;

  @BeforeEach
  void setUp() throws Exception {
    UUID deviceKey = UUID.randomUUID();
    JsonNode register = registerUser("link_user", "password123", deviceKey);
    accessToken = register.path("data").path("accessToken").asText();
    userId = UUID.fromString(register.path("data").path("user").path("id").asText());

    when(microsoftOAuthClient.provider()).thenReturn(CloudProvider.ONEDRIVE);
    when(microsoftOAuthClient.refresh(anyString()))
        .thenReturn(new TokenResult("provider-access-token", "refresh-token", 3600, "scope"));

    ProviderConnectionEntity connection = new ProviderConnectionEntity();
    connection.setUserId(userId);
    connection.setProvider(CloudProvider.ONEDRIVE.id());
    connection.setAccountId("account-1");
    connection.setEncryptedRefreshToken(tokenCipher.encrypt("refresh-token"));
    connection.setConnectedAt(OffsetDateTime.now());
    connectionRepository.save(connection);

    fakeOneDriveClient.putItem(FakeOneDriveClient.file("file-1", "Relatorio.pdf", "application/pdf", "pdf", 4096));
    fakeOneDriveClient.putItem(FakeOneDriveClient.folder("folder-1", "Projects"));
    fakeOneDriveClient.setReadPlan(new ReadPlan(ReadMode.PDF, ContentVariant.READ, "application/pdf"));
  }

  @Test
  void ownerCanCreateGetAndDeletePublicLink() throws Exception {
    mockMvc.perform(get("/api/providers/onedrive/items/file-1/public-link")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data").value(org.hamcrest.Matchers.nullValue()));

    JsonNode created = readJson(mockMvc.perform(put("/api/providers/onedrive/items/file-1/public-link")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.suffix").isNotEmpty())
        .andExpect(jsonPath("$.data.url").value(org.hamcrest.Matchers.containsString("/p/relatorio-")))
        .andReturn());

    String suffix = created.path("data").path("suffix").asText();

    mockMvc.perform(get("/api/providers/onedrive/items/file-1/public-link")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.suffix").value(suffix));

    mockMvc.perform(delete("/api/providers/onedrive/items/file-1/public-link")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk());

    assertThat(publicLinkRepository.findBySuffix(suffix)).isEmpty();
  }

  @Test
  void createPublicLinkRejectsFolders() throws Exception {
    mockMvc.perform(put("/api/providers/onedrive/items/folder-1/public-link")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("LINK_APENAS_ARQUIVO"));
  }

  @Test
  void anonymousMetadataWorksWithoutJwtAndSetsNoIndexHeader() throws Exception {
    String suffix = createLinkSuffix();

    mockMvc.perform(get("/api/public/links/" + suffix))
        .andExpect(status().isOk())
        .andExpect(header().string("X-Robots-Tag", "noindex, nofollow"))
        .andExpect(jsonPath("$.data.name").value("Relatorio.pdf"))
        .andExpect(jsonPath("$.data.providerName").value("OneDrive"))
        .andExpect(jsonPath("$.data.contentUrl").value("/api/public/links/" + suffix + "/content"))
        .andExpect(jsonPath("$.data.readUrl").value("/api/public/links/" + suffix + "/content?variant=read"))
        .andExpect(jsonPath("$.data.mode").value("pdf"));
  }

  @Test
  void unknownOrMalformedSuffixReturns404() throws Exception {
    mockMvc.perform(get("/api/public/links/not-valid"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));

    mockMvc.perform(get("/api/public/links/AbCdEfGhIjKlMnOp"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));
  }

  @Test
  void contentStreamSupportsReadVariantWithNoIndexHeader() throws Exception {
    String suffix = createLinkSuffix();

    mockMvc.perform(get("/api/public/links/" + suffix + "/content?variant=read"))
        .andExpect(status().isOk())
        .andExpect(header().string("X-Robots-Tag", "noindex, nofollow"))
        .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("inline")));
  }

  private String createLinkSuffix() throws Exception {
    JsonNode created = readJson(mockMvc.perform(put("/api/providers/onedrive/items/file-1/public-link")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andReturn());
    return created.path("data").path("suffix").asText();
  }
}
