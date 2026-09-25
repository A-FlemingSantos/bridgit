package com.bridgit.api.files;

import com.bridgit.api.ApiIntegrationTestSupport;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionRepository;
import com.bridgit.api.integrations.ProviderConnectionService;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClient;
import com.bridgit.api.providers.ContentStream;
import com.bridgit.api.providers.ContentVariant;
import com.bridgit.api.providers.ItemKind;
import com.bridgit.api.providers.ItemPage;
import com.bridgit.api.providers.ReadPlan;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
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
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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

  @MockitoBean
  private ProviderConnectionService providerConnectionService;

  @BeforeEach
  void stubProviderConnectionService() {
    when(providerConnectionService.requireConnection(any(), any())).thenAnswer(invocation -> {
      UUID userId = invocation.getArgument(0);
      CloudProvider provider = invocation.getArgument(1);
      return connectionRepository.findByUserIdAndProvider(userId, provider.id())
          .orElseThrow();
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
    ProviderConnectionEntity connection = new ProviderConnectionEntity();
    connection.setUserId(userId);
    connection.setProvider(provider.id());
    connection.setAccountId("acct");
    connection.setEncryptedRefreshToken("enc");
    connection.setConnectedAt(OffsetDateTime.now());
    connectionRepository.save(connection);
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
          CloudItem folder = new CloudItem(
              "folder-1", provider.id(), "Alpha", ItemKind.FOLDER, null, null, null, null, null
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
            InputStream content
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
