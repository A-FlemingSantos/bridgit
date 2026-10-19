package com.bridgit.api.links;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
import com.bridgit.api.providers.CloudItem;
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
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

@Import(HubTestCloudProviderConfig.class)
class PublicLinkApiIntegrationTest extends ApiIntegrationTestSupport {

  @MockitoSpyBean
  private FakeOneDriveClient fakeOneDriveClient;

  @Autowired
  private ProviderConnectionRepository connectionRepository;

  @Autowired
  private PublicLinkRepository publicLinkRepository;

  @Autowired
  private PublicLinkService publicLinkService;

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
    fakeOneDriveClient.putItem(FakeOneDriveClient.file("file-2", "Outro.pdf", "application/pdf", "pdf", 16));
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
        .andExpect(jsonPath("$.data.alias").value("relatorio"))
        .andExpect(jsonPath("$.data.kind").value("file"))
        .andExpect(jsonPath("$.data.code").value(org.hamcrest.Matchers.matchesPattern("[a-z0-9]{4}")))
        .andExpect(jsonPath("$.data.url").value(org.hamcrest.Matchers.matchesPattern(".*/p/relatorio-[a-z0-9]{4}$")))
        .andReturn());

    String code = created.path("data").path("code").asText();
    assertThat(created.path("data").path("suffix").asText()).isEqualTo(code);
    String linkRef = "relatorio-" + code;

    mockMvc.perform(get("/api/providers/onedrive/items/file-1/public-link")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.suffix").value(code))
        .andExpect(jsonPath("$.data.code").value(code));

    mockMvc.perform(delete("/api/providers/onedrive/items/file-1/public-link")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk());

    assertThat(findLink(linkRef)).isEmpty();
  }

  @Test
  void ownerListsOnlyOwnPublicLinks() throws Exception {
    mockMvc.perform(get("/api/hub/public-links")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data").isEmpty());

    mockMvc.perform(put("/api/providers/onedrive/items/file-1/public-link")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk());

    mockMvc.perform(get("/api/hub/public-links")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.length()").value(1))
        .andExpect(jsonPath("$.data[0].provider").value("onedrive"))
        .andExpect(jsonPath("$.data[0].ref").value("file-1"))
        .andExpect(jsonPath("$.data[0].kind").value("file"))
        .andExpect(jsonPath("$.data[0].alias").value("relatorio"))
        .andExpect(jsonPath("$.data[0].code").value(org.hamcrest.Matchers.matchesPattern("[a-z0-9]{4}")))
        .andExpect(jsonPath("$.data[0].name").value("Relatorio.pdf"))
        .andExpect(jsonPath("$.data[0].url").value(org.hamcrest.Matchers.containsString("/p/relatorio-")))
        .andExpect(jsonPath("$.data[0].createdAt").isNotEmpty());

    JsonNode other = registerUser("link_other", "password123", UUID.randomUUID());
    String otherToken = other.path("data").path("accessToken").asText();
    mockMvc.perform(get("/api/hub/public-links")
            .header("Authorization", "Bearer " + otherToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data").isEmpty());
  }

  @Test
  void listPublicLinksRequiresAuthentication() throws Exception {
    mockMvc.perform(get("/api/hub/public-links"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void createPublicLinkAcceptsFoldersAndStoresTheirKind() throws Exception {
    mockMvc.perform(put("/api/providers/onedrive/items/folder-1/public-link")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.kind").value("folder"))
        .andExpect(jsonPath("$.data.alias").value("projects"));

    mockMvc.perform(get("/api/hub/public-links")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[0].kind").value("folder"))
        .andExpect(jsonPath("$.data[0].alias").value("projects"));
  }

  @Test
  void publishingTheProviderRootIsRefused() throws Exception {
    mockMvc.perform(put("/api/providers/onedrive/items/root/public-link")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("LINK_RAIZ_INVALIDA"));
  }

  @Test
  void folderLinkMetadataHidesEverythingButKindNameAndProvider() throws Exception {
    String linkRef = createLinkRefFor("folder-1");

    mockMvc.perform(get("/api/public/links/" + linkRef))
        .andExpect(status().isOk())
        .andExpect(header().string("X-Robots-Tag", "noindex, nofollow"))
        .andExpect(jsonPath("$.data.kind").value("folder"))
        .andExpect(jsonPath("$.data.name").value("Projects"))
        .andExpect(jsonPath("$.data.providerName").value("OneDrive"))
        .andExpect(jsonPath("$.data.contentUrl").doesNotExist())
        .andExpect(jsonPath("$.data.readUrl").doesNotExist())
        .andExpect(jsonPath("$.data.mode").doesNotExist())
        .andExpect(jsonPath("$.data.size").doesNotExist());
    assertThat(findLink(linkRef).orElseThrow().getLastAccessedAt()).isNotNull();
  }

  @Test
  void folderLinkHasNoContent() throws Exception {
    String linkRef = createLinkRefFor("folder-1");

    mockMvc.perform(get("/api/public/links/" + linkRef + "/content"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));
    mockMvc.perform(get("/api/public/links/" + linkRef + "/content?variant=read"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));
  }

  @Test
  void patchChangesTheAliasKeepsTheCodeAndInvalidatesTheOldUrl() throws Exception {
    String oldRef = createLinkRef();
    String code = oldRef.substring(oldRef.lastIndexOf('-') + 1);

    mockMvc.perform(patch("/api/providers/onedrive/items/file-1/public-link")
            .header("Authorization", "Bearer " + accessToken)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"alias\":\"  Relatório Final!! \"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.alias").value("relatorio-final"))
        .andExpect(jsonPath("$.data.code").value(code))
        .andExpect(jsonPath("$.data.suffix").value(code))
        .andExpect(jsonPath("$.data.url").value(org.hamcrest.Matchers.endsWith("/p/relatorio-final-" + code)));

    String newRef = "relatorio-final-" + code;
    mockMvc.perform(get("/api/public/links/" + newRef))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.name").value("Relatorio.pdf"))
        .andExpect(jsonPath("$.data.contentUrl").value("/api/public/links/" + newRef + "/content"))
        .andExpect(jsonPath("$.data.readUrl").value("/api/public/links/" + newRef + "/content?variant=read"));
    // an uppercase alias in the URL resolves too: the alias part is looked up in lowercase
    mockMvc.perform(get("/api/public/links/Relatorio-Final-" + code)).andExpect(status().isOk());
    mockMvc.perform(get("/api/public/links/" + oldRef).with(remoteAddr("198.51.100.6")))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));
  }

  @Test
  void patchWithTheSameAliasIsANoOp() throws Exception {
    String ref = createLinkRef();
    OffsetDateTime before = findLink(ref).orElseThrow().getUpdatedAt();

    mockMvc.perform(patch("/api/providers/onedrive/items/file-1/public-link")
            .header("Authorization", "Bearer " + accessToken)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"alias\":\"RELATORIO\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.alias").value("relatorio"));

    assertThat(findLink(ref).orElseThrow().getUpdatedAt()).isEqualTo(before);
  }

  @Test
  void patchRejectsInvalidAliases() throws Exception {
    createLinkRef();

    for (String body : new String[] {
        "{\"alias\":\"\"}", "{\"alias\":\"  --  \"}", "{\"alias\":null}", "{}",
        "{\"alias\":\"" + "a".repeat(61) + "\"}"}) {
      mockMvc.perform(patch("/api/providers/onedrive/items/file-1/public-link")
              .header("Authorization", "Bearer " + accessToken)
              .contentType(MediaType.APPLICATION_JSON)
              .content(body))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.error.code").value("APELIDO_INVALIDO"));
    }
  }

  @Test
  void patchWithoutALinkIs404() throws Exception {
    mockMvc.perform(patch("/api/providers/onedrive/items/file-1/public-link")
            .header("Authorization", "Bearer " + accessToken)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"alias\":\"qualquer\"}"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));
  }

  @Test
  void patchToAnAliasAndCodeTakenByAnotherLinkIs409() throws Exception {
    createLinkRef();
    String otherRef = createLinkRefFor("file-2");
    String otherCode = otherRef.substring(otherRef.lastIndexOf('-') + 1);
    // the other link is "outro-<code>"; give file-1 the same code so that moving it to "outro" collides
    PublicLinkEntity first = publicLinkRepository.findAll().stream()
        .filter(link -> "file-1".equals(link.getItemRef())).findFirst().orElseThrow();
    first.setSuffix(otherCode);
    publicLinkRepository.save(first);

    mockMvc.perform(patch("/api/providers/onedrive/items/file-1/public-link")
            .header("Authorization", "Bearer " + accessToken)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"alias\":\"outro\"}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("APELIDO_INDISPONIVEL"));

    assertThat(publicLinkRepository.findBySlugAndSuffix("relatorio", otherCode)).isPresent();
  }

  @Test
  void patchRequiresAuthentication() throws Exception {
    mockMvc.perform(patch("/api/providers/onedrive/items/file-1/public-link")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"alias\":\"x\"}"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void aliasAndCodeMustBothMatch() throws Exception {
    String ref = createLinkRef();
    String code = ref.substring(ref.lastIndexOf('-') + 1);

    mockMvc.perform(get("/api/public/links/outro-" + code).with(remoteAddr("198.51.100.1")))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));
    mockMvc.perform(get("/api/public/links/relatorio-zzzz").with(remoteAddr("198.51.100.1")))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));
    // the code alone, without the alias, does not resolve either
    mockMvc.perform(get("/api/public/links/" + code).with(remoteAddr("198.51.100.1")))
        .andExpect(status().isNotFound());
  }

  @Test
  void legacyLinkWithSixteenMixedCaseCharactersKeepsResolving() throws Exception {
    PublicLinkEntity legacy = new PublicLinkEntity();
    legacy.setUserId(userId);
    legacy.setConnectionId(connectionRepository.findAll().get(0).getId());
    legacy.setItemRef("file-1");
    legacy.setSlug("relatorio");
    legacy.setSuffix("AbCdEfGhIjKlMnOp");
    legacy.setName("Relatorio.pdf");
    publicLinkRepository.save(legacy);

    mockMvc.perform(get("/api/public/links/relatorio-AbCdEfGhIjKlMnOp"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.name").value("Relatorio.pdf"))
        .andExpect(jsonPath("$.data.contentUrl")
            .value("/api/public/links/relatorio-AbCdEfGhIjKlMnOp/content"));
    // codes compare case-sensitively
    mockMvc.perform(get("/api/public/links/relatorio-abcdefghijklmnop").with(remoteAddr("198.51.100.2")))
        .andExpect(status().isNotFound());
  }

  @Test
  void failedLookupsAreLimitedPerAddressBeforeAnyLookup() throws Exception {
    String ref = createLinkRef();

    // a miss recorded through the seam counts like a miss through the API
    for (int i = 0; i < 10; i++) {
      publicLinkService.recordFailedLookup("198.51.100.3");
    }
    for (int i = 0; i < 10; i++) {
      mockMvc.perform(get("/api/public/links/nada-aaaa").with(remoteAddr("198.51.100.3")))
          .andExpect(status().isNotFound());
    }

    // over the limit: even a valid link answers 429 for this address, other addresses are not affected
    mockMvc.perform(get("/api/public/links/" + ref).with(remoteAddr("198.51.100.3")))
        .andExpect(status().isTooManyRequests())
        .andExpect(header().exists("Retry-After"))
        .andExpect(jsonPath("$.error.code").value("MUITOS_ACESSOS"));
    mockMvc.perform(get("/api/public/links/nada-aaaa").with(remoteAddr("198.51.100.3")))
        .andExpect(status().isTooManyRequests());
    mockMvc.perform(get("/api/public/links/" + ref).with(remoteAddr("198.51.100.4")))
        .andExpect(status().isOk());
  }

  @Test
  void anonymousMetadataWorksWithoutJwtAndSetsNoIndexHeader() throws Exception {
    String linkRef = createLinkRef();

    mockMvc.perform(get("/api/public/links/" + linkRef))
        .andExpect(status().isOk())
        .andExpect(header().string("X-Robots-Tag", "noindex, nofollow"))
        .andExpect(jsonPath("$.data.name").value("Relatorio.pdf"))
        .andExpect(jsonPath("$.data.providerName").value("OneDrive"))
        .andExpect(jsonPath("$.data.contentUrl").value("/api/public/links/" + linkRef + "/content"))
        .andExpect(jsonPath("$.data.readUrl").value("/api/public/links/" + linkRef + "/content?variant=read"))
        .andExpect(jsonPath("$.data.mode").value("pdf"));
  }

  @Test
  void unknownOrMalformedLinkRefReturns404() throws Exception {
    mockMvc.perform(get("/api/public/links/not-valid").with(remoteAddr("198.51.100.5")))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));

    mockMvc.perform(get("/api/public/links/AbCdEfGhIjKlMnOp").with(remoteAddr("198.51.100.5")))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));
  }

  @Test
  void contentStreamSupportsReadVariantWithNoIndexHeader() throws Exception {
    String linkRef = createLinkRef();

    mockMvc.perform(get("/api/public/links/" + linkRef + "/content?variant=read"))
        .andExpect(status().isOk())
        .andExpect(header().string("X-Robots-Tag", "noindex, nofollow"))
        .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("inline")));
  }

  private String createLinkRef() throws Exception {
    return createLinkRefFor("file-1");
  }

  private String createLinkRefFor(String ref) throws Exception {
    JsonNode created = readJson(mockMvc.perform(put("/api/providers/onedrive/items/" + ref + "/public-link")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andReturn());
    return created.path("data").path("alias").asText() + "-" + created.path("data").path("code").asText();
  }

  private java.util.Optional<PublicLinkEntity> findLink(String linkRef) {
    int dash = linkRef.lastIndexOf('-');
    return publicLinkRepository.findBySlugAndSuffix(linkRef.substring(0, dash), linkRef.substring(dash + 1));
  }

  private static org.springframework.test.web.servlet.request.RequestPostProcessor remoteAddr(String address) {
    return request -> {
      request.setRemoteAddr(address);
      return request;
    };
  }

  @Test
  void streamingHappensOutsideTransactionsAndTouchesLastAccessed() throws Exception {
    String linkRef = createLinkRef();

    mockMvc.perform(get("/api/public/links/" + linkRef + "/content"))
        .andExpect(status().isOk());

    assertThat(fakeOneDriveClient.openSawTransaction()).isFalse();
    assertThat(findLink(linkRef).orElseThrow().getLastAccessedAt()).isNotNull();
  }

  @Test
  void anonymousRangeReturnsPartialContent() throws Exception {
    String linkRef = createLinkRef();

    mockMvc.perform(get("/api/public/links/" + linkRef + "/content").header("Range", "bytes=0-3"))
        .andExpect(status().isPartialContent())
        .andExpect(header().string("Content-Range", "bytes 0-3/16"))
        .andExpect(header().string("Accept-Ranges", "bytes"))
        .andExpect(mvc -> assertThat(mvc.getResponse().getContentAsByteArray())
            .isEqualTo("orig".getBytes()));
  }

  @Test
  void anonymousSuffixRangeReturnsTail() throws Exception {
    String linkRef = createLinkRef();

    mockMvc.perform(get("/api/public/links/" + linkRef + "/content").header("Range", "bytes=-4"))
        .andExpect(status().isPartialContent())
        .andExpect(header().string("Content-Range", "bytes 12-15/16"));
  }

  @Test
  void anonymousOutOfBoundsRangeReturns416() throws Exception {
    String linkRef = createLinkRef();

    mockMvc.perform(get("/api/public/links/" + linkRef + "/content").header("Range", "bytes=100-"))
        .andExpect(status().isRequestedRangeNotSatisfiable())
        .andExpect(header().string("Content-Range", "bytes */16"));
  }

  @Test
  void anonymousMalformedRangeFallsBackToFullContent() throws Exception {
    String linkRef = createLinkRef();

    mockMvc.perform(get("/api/public/links/" + linkRef + "/content").header("Range", "bytes=abc"))
        .andExpect(status().isOk())
        .andExpect(header().doesNotExist("Accept-Ranges"));
  }

  @Test
  void readVariantNeverAdvertisesRanges() throws Exception {
    String linkRef = createLinkRef();

    mockMvc.perform(get("/api/public/links/" + linkRef + "/content?variant=read").header("Range", "bytes=0-3"))
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
  void provider401TwiceLooksLikeMissingLinkToVisitor() throws Exception {
    String linkRef = createLinkRef();
    fakeOneDriveClient.setGetFailure(new ProviderApiException(
        HttpStatus.UNAUTHORIZED, "TOKEN_PROVEDOR_INVALIDO", "Token do provedor expirou."));

    mockMvc.perform(get("/api/public/links/" + linkRef))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));

    assertThat(findLink(linkRef)).isPresent();
  }

  @Test
  void ownerLinkWithoutJwtIsHub401() throws Exception {
    mockMvc.perform(get("/api/providers/onedrive/items/file-1/public-link"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void provider404DeletesLinkInCommittedTransaction() throws Exception {
    String linkRef = createLinkRef();
    fakeOneDriveClient.setGetFailure(new ProviderApiException(
        HttpStatus.NOT_FOUND, "ITEM_NAO_ENCONTRADO", "Item não encontrado."));

    mockMvc.perform(get("/api/public/links/" + linkRef))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));

    assertThat(findLink(linkRef)).isEmpty();
  }

  @Test
  void removedConnectionDeletesLink() throws Exception {
    String linkRef = createLinkRef();
    connectionRepository.deleteAll();

    mockMvc.perform(get("/api/public/links/" + linkRef))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));

    assertThat(findLink(linkRef)).isEmpty();
  }

  @Test
  void transientProviderErrorKeepsLink() throws Exception {
    String linkRef = createLinkRef();
    fakeOneDriveClient.setGetFailure(new ProviderApiException(
        HttpStatus.SERVICE_UNAVAILABLE, "PROVEDOR_INDISPONIVEL", "Indisponivel."));

    mockMvc.perform(get("/api/public/links/" + linkRef))
        .andExpect(status().isServiceUnavailable())
        .andExpect(jsonPath("$.error.code").value("LINK_INDISPONIVEL"));

    assertThat(findLink(linkRef)).isPresent();
  }

  @Test
  void reconnectionRequiredKeepsLink() throws Exception {
    String linkRef = createLinkRef();
    fakeOneDriveClient.setGetFailure(new ReconnectionRequiredException());

    mockMvc.perform(get("/api/public/links/" + linkRef))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));

    assertThat(findLink(linkRef)).isPresent();
  }

  @Test
  void providerFailureOpeningContentLooksLikeMissingLink() throws Exception {
    String linkRef = createLinkRef();
    doThrow(new ProviderApiException("Não foi possível abrir o conteúdo."))
        .when(fakeOneDriveClient).open(anyString(), any(CloudItem.class), any(ContentVariant.class));

    mockMvc.perform(get("/api/public/links/" + linkRef + "/content"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));

    assertThat(findLink(linkRef)).isPresent();
  }

  @Test
  void providerFailureInReadPlanLooksLikeMissingLink() throws Exception {
    String linkRef = createLinkRef();
    doThrow(new ProviderApiException("Falha."))
        .when(fakeOneDriveClient).readPlan(any(CloudItem.class));

    mockMvc.perform(get("/api/public/links/" + linkRef))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));

    mockMvc.perform(get("/api/public/links/" + linkRef + "/content?variant=read"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));
  }

  @Test
  void invalidProviderTokenWhileOpeningContentIsNot502() throws Exception {
    String linkRef = createLinkRef();
    doThrow(new ProviderApiException(HttpStatus.UNAUTHORIZED, "TOKEN_PROVEDOR_INVALIDO", "Token expirou."))
        .when(fakeOneDriveClient).open(anyString(), any(CloudItem.class), any(ContentVariant.class));

    mockMvc.perform(get("/api/public/links/" + linkRef + "/content"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));
  }

  @Test
  void noPermissionAtProviderLooksLikeMissingLink() throws Exception {
    String linkRef = createLinkRef();
    fakeOneDriveClient.setGetFailure(new ProviderApiException(
        HttpStatus.FORBIDDEN, "SEM_PERMISSAO", "Sem permissao."));

    mockMvc.perform(get("/api/public/links/" + linkRef))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));

    assertThat(findLink(linkRef)).isPresent();
  }

  @Test
  void providerRateLimitOnMetadataIsTemporaryWithRetryAfter() throws Exception {
    String linkRef = createLinkRef();
    fakeOneDriveClient.setGetFailure(new ProviderApiException(
        HttpStatus.TOO_MANY_REQUESTS, "PROVEDOR_LIMITADO", "Limitado.", 30L));

    mockMvc.perform(get("/api/public/links/" + linkRef))
        .andExpect(status().isServiceUnavailable())
        .andExpect(header().string("Retry-After", "30"))
        .andExpect(jsonPath("$.error.code").value("LINK_INDISPONIVEL"));

    assertThat(findLink(linkRef)).isPresent();
  }

  @Test
  void provider503WhileOpeningContentIsTemporaryWithoutRetryAfter() throws Exception {
    String linkRef = createLinkRef();
    doThrow(new ProviderApiException(
        HttpStatus.SERVICE_UNAVAILABLE, "PROVEDOR_INDISPONIVEL", "Indisponivel."))
        .when(fakeOneDriveClient).open(anyString(), any(CloudItem.class), any(ContentVariant.class));

    mockMvc.perform(get("/api/public/links/" + linkRef + "/content"))
        .andExpect(status().isServiceUnavailable())
        .andExpect(header().doesNotExist("Retry-After"))
        .andExpect(jsonPath("$.error.code").value("LINK_INDISPONIVEL"));
  }

  @Test
  void providerRateLimitWhileOpeningContentIsTemporaryWithRetryAfter() throws Exception {
    String linkRef = createLinkRef();
    doThrow(new ProviderApiException(
        HttpStatus.TOO_MANY_REQUESTS, "PROVEDOR_LIMITADO", "Limitado.", 12L))
        .when(fakeOneDriveClient).open(anyString(), any(CloudItem.class), any(ContentVariant.class));

    mockMvc.perform(get("/api/public/links/" + linkRef + "/content"))
        .andExpect(status().isServiceUnavailable())
        .andExpect(header().string("Retry-After", "12"))
        .andExpect(jsonPath("$.error.code").value("LINK_INDISPONIVEL"));
  }

  @Test
  void accessesAboveTheLimitGet429WithRetryAfter() throws Exception {
    String linkRef = createLinkRef();
    String other = createLinkRefFor("file-2");

    for (int i = 0; i < 60; i++) {
      mockMvc.perform(get("/api/public/links/" + linkRef)).andExpect(status().isOk());
    }

    mockMvc.perform(get("/api/public/links/" + linkRef))
        .andExpect(status().isTooManyRequests())
        .andExpect(header().exists("Retry-After"))
        .andExpect(jsonPath("$.error.code").value("MUITOS_ACESSOS"));
    // content shares the same budget
    mockMvc.perform(get("/api/public/links/" + linkRef + "/content"))
        .andExpect(status().isTooManyRequests())
        .andExpect(jsonPath("$.error.code").value("MUITOS_ACESSOS"));
    // another link, or another visitor, is not affected
    mockMvc.perform(get("/api/public/links/" + other)).andExpect(status().isOk());
    mockMvc.perform(get("/api/public/links/" + linkRef).with(request -> {
      request.setRemoteAddr("203.0.113.9");
      return request;
    })).andExpect(status().isOk());
  }

  @Test
  void metadataDoesNotRewriteTheLinkOnEveryVisit() throws Exception {
    String linkRef = createLinkRef();

    mockMvc.perform(get("/api/public/links/" + linkRef)).andExpect(status().isOk());
    PublicLinkEntity first = findLink(linkRef).orElseThrow();
    assertThat(first.getLastAccessedAt()).isNotNull();

    mockMvc.perform(get("/api/public/links/" + linkRef)).andExpect(status().isOk());
    mockMvc.perform(get("/api/public/links/" + linkRef + "/content")).andExpect(status().isOk());
    PublicLinkEntity second = findLink(linkRef).orElseThrow();

    assertThat(second.getLastAccessedAt()).isEqualTo(first.getLastAccessedAt());
    assertThat(second.getUpdatedAt()).isEqualTo(first.getUpdatedAt());
  }

  @Test
  void staleLastAccessAndChangedSnapshotAreWrittenTogether() throws Exception {
    String linkRef = createLinkRef();
    PublicLinkEntity link = findLink(linkRef).orElseThrow();
    OffsetDateTime stale = OffsetDateTime.now().minusMinutes(5);
    link.setLastAccessedAt(stale);
    publicLinkRepository.save(link);
    fakeOneDriveClient.putItem(FakeOneDriveClient.file("file-1", "Novo nome.pdf", "application/pdf", "pdf", 32));

    mockMvc.perform(get("/api/public/links/" + linkRef))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.name").value("Novo nome.pdf"));

    PublicLinkEntity after = findLink(linkRef).orElseThrow();
    assertThat(after.getName()).isEqualTo("Novo nome.pdf");
    assertThat(after.getSize()).isEqualTo(32L);
    assertThat(after.getLastAccessedAt()).isAfter(stale.plusMinutes(3));
  }

  @Test
  void changedSnapshotAloneIsStoredWithoutTouchingRecentLastAccess() throws Exception {
    String linkRef = createLinkRef();
    mockMvc.perform(get("/api/public/links/" + linkRef)).andExpect(status().isOk());
    OffsetDateTime lastAccess = findLink(linkRef).orElseThrow().getLastAccessedAt();
    fakeOneDriveClient.putItem(FakeOneDriveClient.file("file-1", "Outro.pdf", "application/pdf", "pdf", 16));

    mockMvc.perform(get("/api/public/links/" + linkRef)).andExpect(status().isOk());

    PublicLinkEntity after = findLink(linkRef).orElseThrow();
    assertThat(after.getName()).isEqualTo("Outro.pdf");
    assertThat(after.getLastAccessedAt()).isEqualTo(lastAccess);
  }
}
