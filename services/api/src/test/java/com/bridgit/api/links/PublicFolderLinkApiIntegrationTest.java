package com.bridgit.api.links;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
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
import com.bridgit.api.providers.ProviderApiException;
import com.bridgit.api.providers.ReadMode;
import com.bridgit.api.providers.ReadPlan;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@Import(HubTestCloudProviderConfig.class)
class PublicFolderLinkApiIntegrationTest extends ApiIntegrationTestSupport {

  private static final AtomicInteger VISITORS = new AtomicInteger();
  // A file whose ref carries characters that need care in a URL path.
  private static final String BANG_FILE = "pf!file-1";

  @MockitoSpyBean
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
  // Each test browses from its own address so failed lookups of one test never throttle another.
  private RequestPostProcessor visitor;

  @BeforeEach
  void setUp() throws Exception {
    int n = VISITORS.incrementAndGet();
    visitor = request -> {
      request.setRemoteAddr("10.77." + (n / 250) + "." + (n % 250 + 1));
      return request;
    };

    JsonNode register = registerUser("folder_user", "password123", UUID.randomUUID());
    accessToken = register.path("data").path("accessToken").asText();
    UUID userId = UUID.fromString(register.path("data").path("user").path("id").asText());

    when(microsoftOAuthClient.provider()).thenReturn(CloudProvider.ONEDRIVE);
    when(microsoftOAuthClient.refresh(anyString()))
        .thenReturn(new TokenResult("provider-access-token", "refresh-token", 3600, "scope"));

    ProviderConnectionEntity connection = new ProviderConnectionEntity();
    connection.setUserId(userId);
    connection.setProvider(CloudProvider.ONEDRIVE.id());
    connection.setAccountId("account-folder");
    connection.setEncryptedRefreshToken(tokenCipher.encrypt("refresh-token"));
    connection.setConnectedAt(OffsetDateTime.now());
    connectionRepository.save(connection);

    fakeOneDriveClient.setGetFailure(null);
    fakeOneDriveClient.setListFailure(null);
    fakeOneDriveClient.setPageSize(Integer.MAX_VALUE);
    fakeOneDriveClient.setReadPlan(new ReadPlan(ReadMode.PDF, ContentVariant.READ, "application/pdf"));

    // Shared folder and its tree.
    fakeOneDriveClient.putItem(FakeOneDriveClient.folderIn(null, "pf-root", "Shared Docs"));
    fakeOneDriveClient.putItem(FakeOneDriveClient.folderIn("pf-root", "pf-a", "Alpha"));
    fakeOneDriveClient.putItem(FakeOneDriveClient.fileIn("pf-root", "pf-readme", "Readme.pdf", "application/pdf", "pdf", 16));
    fakeOneDriveClient.putItem(FakeOneDriveClient.folderIn("pf-root", "pf-z", "Zeta"));
    fakeOneDriveClient.putItem(FakeOneDriveClient.fileIn("pf-a", BANG_FILE, "Notes.pdf", "application/pdf", "pdf", 16));
    fakeOneDriveClient.putItem(FakeOneDriveClient.folderIn("pf-a", "pf-deep", "Deep"));
    fakeOneDriveClient.putItem(FakeOneDriveClient.fileIn("pf-deep", "pf-deepfile", "deep.pdf", "application/pdf", "pdf", 16));
    // A second shared folder, to prove cursors do not travel between links.
    fakeOneDriveClient.putItem(FakeOneDriveClient.folderIn(null, "pf-root2", "Other Docs"));
    fakeOneDriveClient.putItem(FakeOneDriveClient.fileIn("pf-root2", "pf-o1", "One.pdf", "application/pdf", "pdf", 16));
    fakeOneDriveClient.putItem(FakeOneDriveClient.fileIn("pf-root2", "pf-o2", "Two.pdf", "application/pdf", "pdf", 16));
    fakeOneDriveClient.putItem(FakeOneDriveClient.fileIn("pf-root2", "pf-o3", "Three.pdf", "application/pdf", "pdf", 16));
    // Elsewhere in the same drive.
    fakeOneDriveClient.putItem(FakeOneDriveClient.folderIn(null, "pf-outside", "Private"));
    fakeOneDriveClient.putItem(FakeOneDriveClient.fileIn("pf-outside", "pf-secret", "Secret.pdf", "application/pdf", "pdf", 16));
    fakeOneDriveClient.putItem(FakeOneDriveClient.fileIn(null, "pf-sibling", "Sibling.pdf", "application/pdf", "pdf", 16));
    fakeOneDriveClient.putItem(FakeOneDriveClient.fileIn(null, "pf-filelink", "Single.pdf", "application/pdf", "pdf", 16));
  }

  @AfterEach
  void tearDown() {
    fakeOneDriveClient.setPageSize(Integer.MAX_VALUE);
    fakeOneDriveClient.setListFailure(null);
  }

  @Test
  void rootListingShowsOnlyPublicFieldsAndHidesTheRootRef() throws Exception {
    String linkRef = linkFor("pf-root");

    String body = browse(linkRef, null, null)
        .andExpect(status().isOk())
        .andExpect(header().string("X-Robots-Tag", "noindex, nofollow"))
        .andExpect(jsonPath("$.data.folder.ref").value(org.hamcrest.Matchers.nullValue()))
        .andExpect(jsonPath("$.data.folder.name").value("Shared Docs"))
        .andExpect(jsonPath("$.data.path").isEmpty())
        .andExpect(jsonPath("$.data.items.length()").value(3))
        .andExpect(jsonPath("$.data.items[0].ref").value("pf-a"))
        .andExpect(jsonPath("$.data.items[0].name").value("Alpha"))
        .andExpect(jsonPath("$.data.items[0].kind").value("folder"))
        .andExpect(jsonPath("$.data.items[1].kind").value("file"))
        .andExpect(jsonPath("$.data.items[1].name").value("Readme.pdf"))
        .andExpect(jsonPath("$.data.items[1].mimeType").value("application/pdf"))
        .andExpect(jsonPath("$.data.items[1].extension").value("pdf"))
        .andExpect(jsonPath("$.data.items[1].size").value(16))
        .andExpect(jsonPath("$.data.items[1].modifiedAt").isNotEmpty())
        .andExpect(jsonPath("$.data.items[1].parentRef").doesNotExist())
        .andExpect(jsonPath("$.data.items[1].provider").doesNotExist())
        .andExpect(jsonPath("$.data.items[1].remoteVersion").doesNotExist())
        .andExpect(jsonPath("$.data.items[1].parentKnown").doesNotExist())
        .andExpect(jsonPath("$.data.nextCursor").value(org.hamcrest.Matchers.nullValue()))
        .andReturn().getResponse().getContentAsString();

    assertThat(body).doesNotContain("pf-root");
  }

  @Test
  void askingForTheSharedFolderByItsRefIsTheRootListing() throws Exception {
    String linkRef = linkFor("pf-root");

    browse(linkRef, "pf-root", null)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.folder.ref").value(org.hamcrest.Matchers.nullValue()))
        .andExpect(jsonPath("$.data.path").isEmpty())
        .andExpect(jsonPath("$.data.items.length()").value(3));
  }

  @Test
  void subfolderListingCarriesThePathFromTheSharedFolder() throws Exception {
    String linkRef = linkFor("pf-root");

    browse(linkRef, "pf-a", null)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.folder.ref").value("pf-a"))
        .andExpect(jsonPath("$.data.folder.name").value("Alpha"))
        .andExpect(jsonPath("$.data.path.length()").value(1))
        .andExpect(jsonPath("$.data.path[0].ref").value(org.hamcrest.Matchers.nullValue()))
        .andExpect(jsonPath("$.data.path[0].name").value("Shared Docs"))
        .andExpect(jsonPath("$.data.items.length()").value(2));
    // A direct child is proven inside from its parent alone.
    verify(fakeOneDriveClient, never()).ancestry(anyString(), eq("pf-a"));

    browse(linkRef, "pf-deep", null)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.folder.ref").value("pf-deep"))
        .andExpect(jsonPath("$.data.folder.name").value("Deep"))
        .andExpect(jsonPath("$.data.path.length()").value(2))
        .andExpect(jsonPath("$.data.path[0].name").value("Shared Docs"))
        .andExpect(jsonPath("$.data.path[1].ref").value("pf-a"))
        .andExpect(jsonPath("$.data.path[1].name").value("Alpha"))
        .andExpect(jsonPath("$.data.items.length()").value(1))
        .andExpect(jsonPath("$.data.items[0].name").value("deep.pdf"));
  }

  @Test
  void aFileCannotBeBrowsedAsAFolder() throws Exception {
    String linkRef = linkFor("pf-root");

    browse(linkRef, "pf-readme", null)
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_ITEM_NAO_ENCONTRADO"));
  }

  @Test
  void paginationFollowsTheSealedCursor() throws Exception {
    String linkRef = linkFor("pf-root");
    fakeOneDriveClient.setPageSize(2);

    JsonNode first = readJson(browse(linkRef, null, null)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.items.length()").value(2))
        .andReturn());
    String cursor = first.path("data").path("nextCursor").asText();
    assertThat(cursor).isNotBlank();
    // The provider's own continuation is sealed, never exposed.
    assertThat(cursor).isNotEqualTo("2");

    browse(linkRef, null, cursor)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.items.length()").value(1))
        .andExpect(jsonPath("$.data.items[0].name").value("Zeta"))
        .andExpect(jsonPath("$.data.nextCursor").value(org.hamcrest.Matchers.nullValue()));
  }

  @Test
  void aCursorFromAnotherLinkOrFolderOrAGarbageCursorIsRefusedAsChanged() throws Exception {
    String linkRef = linkFor("pf-root");
    String otherRef = linkFor("pf-root2");
    fakeOneDriveClient.setPageSize(2);

    String rootCursor = cursorOf(browse(linkRef, null, null));
    String otherCursor = cursorOf(browse(otherRef, null, null));
    fakeOneDriveClient.setPageSize(1);
    String subfolderCursor = cursorOf(browse(linkRef, "pf-a", null));
    fakeOneDriveClient.setPageSize(2);

    browse(otherRef, null, rootCursor)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("PASTA_ALTERADA"));
    browse(linkRef, null, otherCursor)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("PASTA_ALTERADA"));
    browse(linkRef, "pf-a", rootCursor)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("PASTA_ALTERADA"));
    browse(linkRef, null, subfolderCursor)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("PASTA_ALTERADA"));
    browse(linkRef, null, "not-a-cursor")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("PASTA_ALTERADA"));
    // The right cursor on the right link and folder still works.
    browse(linkRef, null, rootCursor).andExpect(status().isOk());
  }

  @Test
  void nestedFileMetadataPointsToItsOwnContentUrls() throws Exception {
    String linkRef = linkFor("pf-root");

    mockMvc.perform(get("/api/public/links/{ref}/items/{item}", linkRef, BANG_FILE).with(visitor))
        .andExpect(status().isOk())
        .andExpect(header().string("X-Robots-Tag", "noindex, nofollow"))
        .andExpect(jsonPath("$.data.kind").value("file"))
        .andExpect(jsonPath("$.data.name").value("Notes.pdf"))
        .andExpect(jsonPath("$.data.mimeType").value("application/pdf"))
        .andExpect(jsonPath("$.data.size").value(16))
        .andExpect(jsonPath("$.data.mode").value("pdf"))
        .andExpect(jsonPath("$.data.providerName").isNotEmpty())
        .andExpect(jsonPath("$.data.contentUrl")
            .value("/api/public/links/" + linkRef + "/items/pf!file-1/content"))
        .andExpect(jsonPath("$.data.readUrl")
            .value("/api/public/links/" + linkRef + "/items/pf!file-1/content?variant=read"));
  }

  @Test
  void folderChildMetadataCarriesOnlyKindNameAndProvider() throws Exception {
    String linkRef = linkFor("pf-root");

    mockMvc.perform(get("/api/public/links/{ref}/items/{item}", linkRef, "pf-a").with(visitor))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.kind").value("folder"))
        .andExpect(jsonPath("$.data.name").value("Alpha"))
        .andExpect(jsonPath("$.data.providerName").isNotEmpty())
        .andExpect(jsonPath("$.data.contentUrl").doesNotExist())
        .andExpect(jsonPath("$.data.size").doesNotExist());
  }

  @Test
  void nestedFileContentDownloadsOriginalReadAndRange() throws Exception {
    String linkRef = linkFor("pf-root");

    String original = mockMvc.perform(
            get("/api/public/links/{ref}/items/{item}/content", linkRef, BANG_FILE).with(visitor))
        .andExpect(status().isOk())
        .andExpect(header().string("X-Robots-Tag", "noindex, nofollow"))
        .andExpect(header().string("X-Content-Type-Options", "nosniff"))
        .andReturn().getResponse().getContentAsString();
    assertThat(original).isEqualTo("original-content");

    String read = mockMvc.perform(
            get("/api/public/links/{ref}/items/{item}/content", linkRef, BANG_FILE)
                .param("variant", "read").with(visitor))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    assertThat(read).isEqualTo("read-content");

    mockMvc.perform(get("/api/public/links/{ref}/items/{item}/content", linkRef, BANG_FILE)
            .header("Range", "bytes=0-3").with(visitor))
        .andExpect(status().isPartialContent())
        .andExpect(header().string("Content-Range", "bytes 0-3/16"))
        .andExpect(header().string("Accept-Ranges", "bytes"));
  }

  @Test
  void itemsOutsideTheSharedFolderAnswerExactlyLikeMissingOnesAndKeepTheLink() throws Exception {
    String linkRef = linkFor("pf-root");

    String missing = mockMvc.perform(get("/api/public/links/{ref}/items/{item}", linkRef, "pf-nope").with(visitor))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_ITEM_NAO_ENCONTRADO"))
        .andReturn().getResponse().getContentAsString();

    for (String outside : new String[] {"pf-sibling", "pf-secret", "pf-outside", "pf-root2"}) {
      String body = mockMvc.perform(get("/api/public/links/{ref}/items/{item}", linkRef, outside).with(visitor))
          .andExpect(status().isNotFound())
          .andReturn().getResponse().getContentAsString();
      assertThat(withoutRequestDetails(body)).isEqualTo(withoutRequestDetails(missing));

      mockMvc.perform(get("/api/public/links/{ref}/items/{item}/content", linkRef, outside).with(visitor))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.error.code").value("LINK_ITEM_NAO_ENCONTRADO"));
      browse(linkRef, outside, null)
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.error.code").value("LINK_ITEM_NAO_ENCONTRADO"));
    }

    assertThat(findLink(linkRef)).isPresent();
    browse(linkRef, null, null).andExpect(status().isOk());
  }

  // The error envelope echoes the request path and a timestamp; everything else must be identical.
  private static String withoutRequestDetails(String body) {
    return body.replaceAll("\"(path|timestamp)\":\"[^\"]*\"", "\"$1\":\"\"");
  }

  @Test
  void aChildDeletedAtTheProviderIsNotFoundAndNeverDeletesTheLink() throws Exception {
    String linkRef = linkFor("pf-root");
    fakeOneDriveClient.removeItem(BANG_FILE);

    mockMvc.perform(get("/api/public/links/{ref}/items/{item}", linkRef, BANG_FILE).with(visitor))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_ITEM_NAO_ENCONTRADO"));

    assertThat(findLink(linkRef)).isPresent();
  }

  @Test
  void missedChildrenCountAsFailedLookups() throws Exception {
    String linkRef = linkFor("pf-root");

    for (int attempt = 0; attempt < 20; attempt++) {
      mockMvc.perform(get("/api/public/links/{ref}/items/{item}", linkRef, "pf-nope-" + attempt).with(visitor))
          .andExpect(status().isNotFound());
    }

    mockMvc.perform(get("/api/public/links/{ref}/items/{item}", linkRef, "pf-nope-last").with(visitor))
        .andExpect(status().isTooManyRequests())
        .andExpect(jsonPath("$.error.code").value("MUITOS_ACESSOS"));
  }

  @Test
  void aReadVariantThatDoesNotExistForAChildIsAnItemMissNotALinkMiss() throws Exception {
    String linkRef = linkFor("pf-root");
    fakeOneDriveClient.setReadPlan(new ReadPlan(ReadMode.NONE, null, null));

    mockMvc.perform(get("/api/public/links/{ref}/items/{item}/content", linkRef, BANG_FILE)
            .param("variant", "read").with(visitor))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_ITEM_NAO_ENCONTRADO"));

    assertThat(findLink(linkRef)).isPresent();
  }

  @Test
  void aFileLinkHasNoItems() throws Exception {
    String linkRef = linkFor("pf-filelink");

    browse(linkRef, null, null)
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));
    mockMvc.perform(get("/api/public/links/{ref}/items/{item}", linkRef, "pf-readme").with(visitor))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));
    mockMvc.perform(get("/api/public/links/{ref}/items/{item}/content", linkRef, "pf-readme").with(visitor))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));
  }

  @Test
  void aFolderChildHasNoContent() throws Exception {
    String linkRef = linkFor("pf-root");

    mockMvc.perform(get("/api/public/links/{ref}/items/{item}/content", linkRef, "pf-a").with(visitor))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_ITEM_NAO_ENCONTRADO"));
    mockMvc.perform(get("/api/public/links/{ref}/content", linkRef).with(visitor))
        .andExpect(status().isNotFound());
  }

  @Test
  void unknownLinkRefsAreTheUsualNotFound() throws Exception {
    browse("nada-zzzz", null, null)
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));
  }

  @Test
  void aDeletedSharedFolderMakesTheLinkCleanItselfUp() throws Exception {
    String linkRef = linkFor("pf-root");
    fakeOneDriveClient.removeItem("pf-root");

    browse(linkRef, null, null)
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("LINK_NAO_ENCONTRADO"));

    assertThat(findLink(linkRef)).isEmpty();
  }

  @Test
  void aTransientListingFailureIsServiceUnavailable() throws Exception {
    String linkRef = linkFor("pf-root");
    fakeOneDriveClient.setListFailure(
        new ProviderApiException(HttpStatus.SERVICE_UNAVAILABLE, "PROVEDOR_INDISPONIVEL", "down"));

    browse(linkRef, null, null)
        .andExpect(status().isServiceUnavailable())
        .andExpect(jsonPath("$.error.code").value("LINK_INDISPONIVEL"));

    assertThat(findLink(linkRef)).isPresent();
  }

  @Test
  void childAccessTouchesLastAccessButNeverRewritesTheSnapshot() throws Exception {
    String linkRef = linkFor("pf-root");
    PublicLinkEntity link = findLink(linkRef).orElseThrow();
    OffsetDateTime stale = OffsetDateTime.now().minusMinutes(10);
    link.setLastAccessedAt(stale);
    publicLinkRepository.save(link);
    // The shared folder was renamed at the provider; only the owner's own actions refresh the snapshot.
    fakeOneDriveClient.putItem(FakeOneDriveClient.folderIn(null, "pf-root", "Renamed Docs"));

    browse(linkRef, null, null)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.folder.name").value("Renamed Docs"));
    mockMvc.perform(get("/api/public/links/{ref}/items/{item}", linkRef, BANG_FILE).with(visitor))
        .andExpect(status().isOk());

    PublicLinkEntity after = findLink(linkRef).orElseThrow();
    assertThat(after.getName()).isEqualTo("Shared Docs");
    assertThat(after.getLastAccessedAt()).isAfter(stale.plusMinutes(5));
  }

  private ResultActions browse(String linkRef, String folder, String cursor) throws Exception {
    MockHttpServletRequestBuilder request = get("/api/public/links/{ref}/items", linkRef).with(visitor);
    if (folder != null) {
      request.param("folder", folder);
    }
    if (cursor != null) {
      request.param("cursor", cursor);
    }
    return mockMvc.perform(request);
  }

  private String cursorOf(ResultActions listing) throws Exception {
    String cursor = readJson(listing.andExpect(status().isOk()).andReturn())
        .path("data").path("nextCursor").asText();
    assertThat(cursor).isNotBlank();
    return cursor;
  }

  private String linkFor(String ref) throws Exception {
    JsonNode created = readJson(mockMvc.perform(put("/api/providers/onedrive/items/" + ref + "/public-link")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andReturn());
    return created.path("data").path("alias").asText() + "-" + created.path("data").path("code").asText();
  }

  private Optional<PublicLinkEntity> findLink(String linkRef) {
    int dash = linkRef.lastIndexOf('-');
    return publicLinkRepository.findBySlugAndSuffix(linkRef.substring(0, dash), linkRef.substring(dash + 1));
  }
}
