package com.bridgit.api.files;

import com.bridgit.api.ApiIntegrationTestSupport;
import com.bridgit.api.common.error.ConflictException;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionRepository;
import com.bridgit.api.integrations.ProviderConnectionService;
import com.bridgit.api.hub.HubRecentRepository;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClient;
import com.bridgit.api.providers.ContentStream;
import com.bridgit.api.providers.ContentVariant;
import com.bridgit.api.providers.ItemKind;
import com.bridgit.api.providers.ItemPage;
import com.bridgit.api.providers.ReadPlan;
import com.bridgit.api.providers.SealedCursorService;
import java.io.ByteArrayInputStream;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.InputStreamSource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Integration tests for the files API. Not run by the implementing agent;
 * parent runs these against bridgit_test.
 */
@ContextConfiguration(classes = FilesApiIntegrationTest.FakeProviderClientConfig.class)
class FilesApiIntegrationTest extends ApiIntegrationTestSupport {

  @Autowired
  private ProviderConnectionRepository connectionRepository;

  @Autowired
  private SealedCursorService sealedCursorService;

  @MockitoBean
  private ProviderConnectionService providerConnectionService;

  @MockitoBean
  private HubRecentRepository hubRecentRepository;

  @BeforeEach
  void stubProviderConnectionService() {
    when(providerConnectionService.requireDefaultConnection(any(), any())).thenAnswer(invocation -> {
      UUID userId = invocation.getArgument(0);
      CloudProvider provider = invocation.getArgument(1);
      return connectionRepository.findByUserIdAndProvider(userId, provider.id())
          .orElseThrow(() -> new ConflictException("PROVEDOR_NAO_CONECTADO", "Conecte este provedor de nuvem antes de continuar."));
    });
    when(providerConnectionService.requireOwnedConnection(any(), any())).thenAnswer(invocation -> {
      UUID userId = invocation.getArgument(0);
      UUID connectionId = invocation.getArgument(1);
      return connectionRepository.findByIdAndUserId(connectionId, userId)
          .orElseThrow(() -> new ConflictException("PROVEDOR_NAO_CONECTADO", "Conecte este provedor de nuvem antes de continuar."));
    });
    when(providerConnectionService.accessToken(any())).thenReturn("fake-token");
  }

  @Test
  void listRootItemsRequiresAuth() throws Exception {
    mockMvc.perform(get("/api/providers/onedrive/items"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void listRootItemsReturnsFolderContext() throws Exception {
    UUID deviceKey = UUID.randomUUID();
    var register = registerUser("files-" + UUID.randomUUID().toString().substring(0, 8), "Password123!", deviceKey);
    String token = register.path("data").path("accessToken").asText();
    UUID userId = UUID.fromString(register.path("data").path("user").path("id").asText());
    seedConnection(userId, CloudProvider.ONEDRIVE);

    mockMvc.perform(get("/api/providers/onedrive/items")
            .header("Authorization", "Bearer " + token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data.folder.name").value("OneDrive"))
        .andExpect(jsonPath("$.data.items[0].name").value("Alpha"));
  }

  private void seedConnection(UUID userId, CloudProvider provider) {
    seedConnection(userId, provider, "acct");
  }

  private UUID seedConnection(UUID userId, CloudProvider provider, String accountId) {
    ProviderConnectionEntity connection = new ProviderConnectionEntity();
    connection.setUserId(userId);
    connection.setProvider(provider.id());
    connection.setAccountId(accountId);
    connection.setEncryptedRefreshToken("enc");
    connection.setConnectedAt(OffsetDateTime.now());
    return connectionRepository.save(connection).getId();
  }

  @Test
  void itemsOfTwoAccountsOfTheSameProviderStayApart() throws Exception {
    var register = registerUser("files-" + UUID.randomUUID().toString().substring(0, 8), "Password123!", UUID.randomUUID());
    String token = register.path("data").path("accessToken").asText();
    UUID userId = UUID.fromString(register.path("data").path("user").path("id").asText());
    UUID accountA = seedConnection(userId, CloudProvider.ONEDRIVE, "acct-a");
    UUID accountB = seedConnection(userId, CloudProvider.ONEDRIVE, "acct-b");
    // The fake provider names its folder after the account whose token it was given.
    doAnswer(invocation -> "acct:" + ((ProviderConnectionEntity) invocation.getArgument(0)).getAccountId())
        .when(providerConnectionService).accessToken(any());

    mockMvc.perform(get("/api/connections/" + accountA + "/items").header("Authorization", "Bearer " + token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.items.length()").value(1))
        .andExpect(jsonPath("$.data.items[0].name").value("Alpha@acct-a"));
    mockMvc.perform(get("/api/connections/" + accountB + "/items").header("Authorization", "Bearer " + token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.items.length()").value(1))
        .andExpect(jsonPath("$.data.items[0].name").value("Alpha@acct-b"));
    mockMvc.perform(get("/api/connections/" + accountB + "/items/folder-1").header("Authorization", "Bearer " + token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.name").value("Alpha@acct-b"));

    // A cursor sealed for one account is refused by the other.
    String cursorOfA = sealedCursorService.seal(accountA, null, "raw-continuation");
    mockMvc.perform(get("/api/connections/" + accountB + "/items").param("cursor", cursorOfA)
            .header("Authorization", "Bearer " + token))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("CURSOR_INVALIDO"));

    // Another user's connection, or one that does not exist, is not connected as far as the caller can tell.
    String otherToken = registerUser("files-" + UUID.randomUUID().toString().substring(0, 8), "Password123!", UUID.randomUUID())
        .path("data").path("accessToken").asText();
    mockMvc.perform(get("/api/connections/" + accountA + "/items").header("Authorization", "Bearer " + otherToken))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("PROVEDOR_NAO_CONECTADO"));
    mockMvc.perform(get("/api/connections/" + UUID.randomUUID() + "/items").header("Authorization", "Bearer " + token))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("PROVEDOR_NAO_CONECTADO"));
  }

  @Test
  void sealedCursorRoundTripListsNextPage() throws Exception {
    var register = registerUser("files-" + UUID.randomUUID().toString().substring(0, 8), "Password123!", UUID.randomUUID());
    String token = register.path("data").path("accessToken").asText();
    UUID userId = UUID.fromString(register.path("data").path("user").path("id").asText());
    seedConnection(userId, CloudProvider.ONEDRIVE);
    UUID connectionId = connectionRepository
        .findByUserIdAndProvider(userId, CloudProvider.ONEDRIVE.id()).orElseThrow().getId();

    String sealed = sealedCursorService.seal(connectionId, null, "raw-continuation");

    mockMvc.perform(get("/api/providers/onedrive/items").param("cursor", sealed)
            .header("Authorization", "Bearer " + token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.items[0].name").value("Alpha"));
  }

  @Test
  void forgedCursorIsRejectedBeforeProviderCall() throws Exception {
    var register = registerUser("files-" + UUID.randomUUID().toString().substring(0, 8), "Password123!", UUID.randomUUID());
    String token = register.path("data").path("accessToken").asText();
    UUID userId = UUID.fromString(register.path("data").path("user").path("id").asText());
    seedConnection(userId, CloudProvider.ONEDRIVE);
    UUID connectionId = connectionRepository
        .findByUserIdAndProvider(userId, CloudProvider.ONEDRIVE.id()).orElseThrow().getId();

    String folderCursor = sealedCursorService.seal(connectionId, "folder-1", "raw");

    mockMvc.perform(get("/api/providers/onedrive/items").param("cursor", "not-a-cursor!!!")
            .header("Authorization", "Bearer " + token))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("CURSOR_INVALIDO"));

    mockMvc.perform(get("/api/providers/onedrive/items").param("cursor", folderCursor)
            .header("Authorization", "Bearer " + token))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("CURSOR_INVALIDO"));
  }

  @Test
  void uploadStillSucceedsWhenLocalSnapshotFails() throws Exception {
    doThrow(new RuntimeException("snapshot indisponivel"))
        .when(hubRecentRepository).updateSnapshot(any(), any(), any(), any(), any());

    var register = registerUser("files-" + UUID.randomUUID().toString().substring(0, 8), "Password123!", UUID.randomUUID());
    String token = register.path("data").path("accessToken").asText();
    UUID userId = UUID.fromString(register.path("data").path("user").path("id").asText());
    seedConnection(userId, CloudProvider.ONEDRIVE);

    mockMvc.perform(multipart("/api/providers/onedrive/files")
            .file(new MockMultipartFile("file", "nota.txt", "text/plain", "conteudo".getBytes()))
            .header("Authorization", "Bearer " + token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.name").value("nota.txt"))
        .andExpect(header().string("X-Bridgit-Local-Sync", "pending"));
  }

  @TestConfiguration
  static class FakeProviderClientConfig {

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    CloudProviderClient fakeOneDriveClient() {
      return fakeClient(CloudProvider.ONEDRIVE);
    }

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    CloudProviderClient fakeGoogleDriveClient() {
      return fakeClient(CloudProvider.GOOGLE_DRIVE);
    }

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    CloudProviderClient fakeDropboxClient() {
      return fakeClient(CloudProvider.DROPBOX);
    }

    private static CloudProviderClient fakeClient(CloudProvider provider) {
      return new CloudProviderClient() {
        @Override
        public CloudProvider provider() {
          return provider;
        }

        @Override
        public ItemPage list(String accessToken, String parentRef, String cursor) {
          String account = accessToken != null && accessToken.startsWith("acct:")
              ? "@" + accessToken.substring("acct:".length())
              : "";
          CloudItem folder = new CloudItem(
              "folder-1", provider.id(), "Alpha" + account, ItemKind.FOLDER, null, null, null, null, null
          );
          return new ItemPage(List.of(folder), null);
        }

        @Override
        public CloudItem get(String accessToken, String ref) {
          return list(accessToken, null, null).items().get(0);
        }

        @Override
        public List<CloudItem> ancestry(String accessToken, String ref) {
          return List.of();
        }

        @Override
        public CloudItem createFolder(String accessToken, String parentRef, String name) {
          return new CloudItem("new", provider.id(), name, ItemKind.FOLDER, null, null, null, null, parentRef);
        }

        @Override
        public CloudItem upload(
            String accessToken,
            String parentRef,
            String name,
            String contentType,
            long size,
            InputStreamSource content
        ) {
          return new CloudItem("up", provider.id(), name, ItemKind.FILE, contentType, null, size, null, parentRef);
        }

        @Override
        public CloudItem update(String accessToken, String ref, String newName, String newParentRef) {
          return get(accessToken, ref);
        }

        @Override
        public void delete(String accessToken, String ref) {
        }

        @Override
        public ReadPlan readPlan(CloudItem item) {
          return new ReadPlan(com.bridgit.api.providers.ReadMode.NONE, ContentVariant.ORIGINAL, null);
        }

        @Override
        public ContentStream open(String accessToken, CloudItem item, ContentVariant variant) {
          return new ContentStream(
              new ByteArrayInputStream(new byte[0]),
              "application/octet-stream",
              0L,
              item.name()
          );
        }

        @Override
        public List<CloudItem> search(String accessToken, String query, int limit) {
          return List.of();
        }
      };
    }
  }
}
