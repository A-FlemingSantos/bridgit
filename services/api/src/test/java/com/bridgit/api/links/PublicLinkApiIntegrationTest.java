package com.bridgit.api.links;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bridgit.api.ApiIntegrationTestSupport;
import com.bridgit.api.files.ContentTicketService;
import com.bridgit.api.hub.FakeOneDriveClient;
import com.bridgit.api.hub.HubTestCloudProviderConfig;
import com.bridgit.api.integrations.IntegrationTokenCipher;
import com.bridgit.api.integrations.MicrosoftOAuthClient;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionRepository;
import com.bridgit.api.integrations.ReconnectionRequiredException;
import com.bridgit.api.integrations.TokenResult;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.ContentVariant;
import com.bridgit.api.providers.ProviderApiException;
import com.bridgit.api.providers.ReadMode;
import com.bridgit.api.providers.ReadPlan;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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

  @org.springframework.beans.factory.annotation.Value("${app.jwt.secret}")
  private String jwtSecret;

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

    fakeOneDriveClient.putItem(FakeOneDriveClient.file("file-1", "Relatorio.pdf", "application/pdf", "pdf", 16));
    fakeOneDriveClient.putItem(FakeOneDriveClient.folder("folder-1", "Projects"));
    fakeOneDriveClient.setReadPlan(new ReadPlan(ReadMode.PDF, ContentVariant.READ, "application/pdf"));
    fakeOneDriveClient.setGetFailure(null);
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

  @Test
  void streamingHappensOutsideTransactionsAndTouchesLastAccessed() throws Exception {
    String suffix = createLinkSuffix();

    mockMvc.perform(get("/api/public/links/" + suffix + "/content"))
        .andExpect(status().isOk());

    assertThat(fakeOneDriveClient.openSawTransaction()).isFalse();
    assertThat(publicLinkRepository.findBySuffix(suffix).orElseThrow().getLastAccessedAt()).isNotNull();
  }

  @Test
  void anonymousRangeReturnsPartialContent() throws Exception {
    String suffix = createLinkSuffix();

    mockMvc.perform(get("/api/public/links/" + suffix + "/content").header("Range", "bytes=0-3"))
        .andExpect(status().isPartialContent())
        .andExpect(header().string("Content-Range", "bytes 0-3/16"))
        .andExpect(header().string("Accept-Ranges", "bytes"))
        .andExpect(mvc -> assertThat(mvc.getResponse().getContentAsByteArray())
            .isEqualTo("orig".getBytes()));
  }

  @Test
  void anonymousSuffixRangeReturnsTail() throws Exception {
    String suffix = createLinkSuffix();

    mockMvc.perform(get("/api/public/links/" + suffix + "/content").header("Range", "bytes=-4"))
        .andExpect(status().isPartialContent())
        .andExpect(header().string("Content-Range", "bytes 12-15/16"));
  }

  @Test
  void anonymousOutOfBoundsRangeReturns416() throws Exception {
    String suffix = createLinkSuffix();

    mockMvc.perform(get("/api/public/links/" + suffix + "/content").header("Range", "bytes=100-"))
        .andExpect(status().isRequestedRangeNotSatisfiable())
        .andExpect(header().string("Content-Range", "bytes */16"));
  }

  @Test
  void anonymousMalformedRangeFallsBackToFullContent() throws Exception {
    String suffix = createLinkSuffix();

    mockMvc.perform(get("/api/public/links/" + suffix + "/content").header("Range", "bytes=abc"))
        .andExpect(status().isOk())
        .andExpect(header().doesNotExist("Accept-Ranges"));
  }

  @Test
  void readVariantNeverAdvertisesRanges() throws Exception {
    String suffix = createLinkSuffix();

    mockMvc.perform(get("/api/public/links/" + suffix + "/content?variant=read").header("Range", "bytes=0-3"))
        .andExpect(status().isOk())
        .andExpect(header().doesNotExist("Accept-Ranges"));
  }

  @Test
  void readAndTicketResponsesCarryExpiry() throws Exception {
    mockMvc.perform(get("/api/providers/onedrive/items/file-1/read")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.url").isNotEmpty())
        .andExpect(jsonPath("$.data.expiresAt").isNotEmpty());

    mockMvc.perform(post("/api/providers/onedrive/items/file-1/ticket")
            .header("Authorization", "Bearer " + accessToken)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"disposition\":\"attachment\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.url").isNotEmpty())
        .andExpect(jsonPath("$.data.expiresAt").isNotEmpty());
  }

  @Test
  void expiredTicketReturns410WhileForgedReturns404() throws Exception {
    ContentTicketService issuer = new ContentTicketService(
        jwtSecret, Clock.fixed(Instant.parse("2020-01-01T00:00:00Z"), ZoneOffset.UTC));
    String expired = issuer.createTicket(
        UUID.randomUUID(), UUID.randomUUID(), "file-1", ContentVariant.ORIGINAL, "inline").ticket();

    mockMvc.perform(get("/api/content/" + expired))
        .andExpect(status().isGone())
        .andExpect(jsonPath("$.error.code").value("CONTEUDO_EXPIRADO"));

    mockMvc.perform(get("/api/content/forged.ticket.value"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("CONTEUDO_NAO_ENCONTRADO"));
  }

  @Test
  void provider401TwiceIsNotHub401() throws Exception {
    String suffix = createLinkSuffix();
    fakeOneDriveClient.setGetFailure(new ProviderApiException(
        HttpStatus.UNAUTHORIZED, "TOKEN_PROVEDOR_INVALIDO", "Token do provedor expirou."));

    mockMvc.perform(get("/api/public/links/" + suffix))
        .andExpect(status().isBadGateway())
        .andExpect(jsonPath("$.error.code").value("TOKEN_PROVEDOR_INVALIDO"));
  }

  @Test
  void ownerLinkWithoutJwtIsHub401() throws Exception {
    mockMvc.perform(get("/api/providers/onedrive/items/file-1/public-link"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void provider404DeletesLinkInCommittedTransaction() throws Exception {
    String suffix = createLinkSuffix();
    fakeOneDriveClient.setGetFailure(new ProviderApiException(
        HttpStatus.NOT_FOUND, "ITEM_NAO_ENCONTRADO", "Item nao encontrado."));

    mockMvc.perform(get("/api/public/links/" + suffix))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));

    assertThat(publicLinkRepository.findBySuffix(suffix)).isEmpty();
  }

  @Test
  void removedConnectionDeletesLink() throws Exception {
    String suffix = createLinkSuffix();
    connectionRepository.deleteAll();

    mockMvc.perform(get("/api/public/links/" + suffix))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));

    assertThat(publicLinkRepository.findBySuffix(suffix)).isEmpty();
  }

  @Test
  void transientProviderErrorKeepsLink() throws Exception {
    String suffix = createLinkSuffix();
    fakeOneDriveClient.setGetFailure(new ProviderApiException(
        HttpStatus.SERVICE_UNAVAILABLE, "PROVEDOR_INDISPONIVEL", "Indisponivel."));

    mockMvc.perform(get("/api/public/links/" + suffix))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));

    assertThat(publicLinkRepository.findBySuffix(suffix)).isPresent();
  }

  @Test
  void reconnectionRequiredKeepsLink() throws Exception {
    String suffix = createLinkSuffix();
    fakeOneDriveClient.setGetFailure(new ReconnectionRequiredException());

    mockMvc.perform(get("/api/public/links/" + suffix))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));

    assertThat(publicLinkRepository.findBySuffix(suffix)).isPresent();
  }
}
