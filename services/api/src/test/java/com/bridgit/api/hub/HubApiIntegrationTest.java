package com.bridgit.api.hub;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bridgit.api.ApiIntegrationTestSupport;
import com.bridgit.api.integrations.IntegrationTokenCipher;
import com.bridgit.api.integrations.MicrosoftOAuthClient;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionRepository;
import com.bridgit.api.integrations.TokenResult;
import com.bridgit.api.links.PublicLinkEntity;
import com.bridgit.api.links.PublicLinkRepository;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudItemChangedEvent;
import com.bridgit.api.providers.CloudItemDeletedEvent;
import com.bridgit.api.providers.CloudProvider;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@Import(HubTestCloudProviderConfig.class)
class HubApiIntegrationTest extends ApiIntegrationTestSupport {

  @Autowired
  private FakeOneDriveClient fakeOneDriveClient;

  @Autowired
  private ProviderConnectionRepository connectionRepository;

  @Autowired
  private HubRecentRepository recentRepository;

  @Autowired
  private HubShortcutRepository shortcutRepository;

  @Autowired
  private PublicLinkRepository publicLinkRepository;

  @Autowired
  private IntegrationTokenCipher tokenCipher;

  @Autowired
  private ApplicationEventPublisher eventPublisher;

  @MockitoBean
  private MicrosoftOAuthClient microsoftOAuthClient;

  private String accessToken;
  private UUID userId;
  private ProviderConnectionEntity connection;

  @BeforeEach
  void setUp() throws Exception {
    UUID deviceKey = UUID.randomUUID();
    JsonNode register = registerUser("hub_user", "password123", deviceKey);
    accessToken = register.path("data").path("accessToken").asText();
    userId = UUID.fromString(register.path("data").path("user").path("id").asText());

    when(microsoftOAuthClient.provider()).thenReturn(CloudProvider.ONEDRIVE);
    when(microsoftOAuthClient.refresh(anyString()))
        .thenReturn(new TokenResult("provider-access-token", "refresh-token", 3600, "scope"));

    connection = new ProviderConnectionEntity();
    connection.setUserId(userId);
    connection.setProvider(CloudProvider.ONEDRIVE.id());
    connection.setAccountId("account-1");
    connection.setEncryptedRefreshToken(tokenCipher.encrypt("refresh-token"));
    connection.setConnectedAt(OffsetDateTime.now());
    connection = connectionRepository.save(connection);

    fakeOneDriveClient.putItem(FakeOneDriveClient.file("file-1", "Document.pdf", "application/pdf", "pdf", 1024));
    fakeOneDriveClient.putItem(FakeOneDriveClient.folder("folder-1", "Projects"));
  }

  @Test
  void addRecentUpsertsSnapshotAndTrimsToTwelve() throws Exception {
    for (int i = 0; i < 13; i++) {
      String ref = "file-" + i;
      fakeOneDriveClient.putItem(FakeOneDriveClient.file(ref, "File " + i + ".txt", "text/plain", "txt", 10));
      mockMvc.perform(post("/api/hub/recents")
              .header("Authorization", "Bearer " + accessToken)
              .contentType(MediaType.APPLICATION_JSON)
              .content("""
                  {"provider":"onedrive","ref":"%s"}
                  """.formatted(ref)))
          .andExpect(status().isOk());
    }

    assertThat(recentRepository.findByUserIdOrderByOpenedAtDesc(userId)).hasSize(12);

    mockMvc.perform(get("/api/hub/recents")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.length()").value(12))
        .andExpect(jsonPath("$.data[0].ref").value("file-12"));
  }

  @Test
  void addRecentRejectsFolders() throws Exception {
    mockMvc.perform(post("/api/hub/recents")
            .header("Authorization", "Bearer " + accessToken)
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"provider":"onedrive","ref":"folder-1"}
                """))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("RECENTE_APENAS_ARQUIVO"));
  }

  @Test
  void shortcutsPutIsIdempotentAndDeleteIsIdempotent() throws Exception {
    mockMvc.perform(put("/api/hub/shortcuts/onedrive/file-1")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.provider").value("onedrive"))
        .andExpect(jsonPath("$.data.ref").value("file-1"))
        .andExpect(jsonPath("$.data.pinnedAt").exists());

    OffsetDateTime firstPinnedAt = shortcutRepository.findByUserIdOrderByPinnedAtDesc(userId).getFirst().getPinnedAt();

    mockMvc.perform(put("/api/hub/shortcuts/onedrive/file-1")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.name").value("Document.pdf"));

    assertThat(shortcutRepository.findByUserIdOrderByPinnedAtDesc(userId).getFirst().getPinnedAt())
        .isEqualTo(firstPinnedAt);

    mockMvc.perform(delete("/api/hub/shortcuts/onedrive/file-1")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk());

    mockMvc.perform(delete("/api/hub/shortcuts/onedrive/file-1")
            .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk());
  }

  @Test
  void itemChangedEventUpdatesSnapshotsAcrossTables() {
    HubRecentEntity recent = new HubRecentEntity();
    recent.setUserId(userId);
    recent.setConnectionId(connection.getId());
    recent.setItemRef("file-1");
    recent.setName("Old Name");
    recent.setOpenedAt(OffsetDateTime.now());
    recentRepository.save(recent);

    HubShortcutEntity shortcut = new HubShortcutEntity();
    shortcut.setUserId(userId);
    shortcut.setConnectionId(connection.getId());
    shortcut.setItemRef("file-1");
    shortcut.setName("Old Name");
    shortcut.setPinnedAt(OffsetDateTime.now());
    shortcutRepository.save(shortcut);

    PublicLinkEntity link = new PublicLinkEntity();
    link.setUserId(userId);
    link.setConnectionId(connection.getId());
    link.setItemRef("file-1");
    link.setSuffix("AbCdEfGhIjKlMnOp");
    link.setSlug("old-name");
    link.setName("Old Name");
    publicLinkRepository.save(link);

    CloudItem updated = FakeOneDriveClient.file("file-1", "Renamed.pdf", "application/pdf", "pdf", 2048);
    eventPublisher.publishEvent(new CloudItemChangedEvent(connection.getId(), updated));

    assertThat(recentRepository.findByConnectionIdAndItemRef(connection.getId(), "file-1").orElseThrow().getName())
        .isEqualTo("Renamed.pdf");
    assertThat(shortcutRepository.findByConnectionIdAndItemRef(connection.getId(), "file-1").orElseThrow().getName())
        .isEqualTo("Renamed.pdf");
    assertThat(publicLinkRepository.findByConnectionIdAndItemRef(connection.getId(), "file-1").orElseThrow().getName())
        .isEqualTo("Renamed.pdf");
  }

  @Test
  void itemDeletedEventRemovesMatchingRows() {
    HubRecentEntity recent = new HubRecentEntity();
    recent.setUserId(userId);
    recent.setConnectionId(connection.getId());
    recent.setItemRef("file-1");
    recent.setName("Document.pdf");
    recent.setOpenedAt(OffsetDateTime.now());
    recentRepository.save(recent);

    HubShortcutEntity shortcut = new HubShortcutEntity();
    shortcut.setUserId(userId);
    shortcut.setConnectionId(connection.getId());
    shortcut.setItemRef("file-1");
    shortcut.setName("Document.pdf");
    shortcut.setPinnedAt(OffsetDateTime.now());
    shortcutRepository.save(shortcut);

    PublicLinkEntity link = new PublicLinkEntity();
    link.setUserId(userId);
    link.setConnectionId(connection.getId());
    link.setItemRef("file-1");
    link.setSuffix("QrStUvWxYzAbCdEf");
    link.setSlug("document");
    link.setName("Document.pdf");
    publicLinkRepository.save(link);

    eventPublisher.publishEvent(new CloudItemDeletedEvent(connection.getId(), "file-1"));

    assertThat(recentRepository.findByConnectionIdAndItemRef(connection.getId(), "file-1")).isEmpty();
    assertThat(shortcutRepository.findByConnectionIdAndItemRef(connection.getId(), "file-1")).isEmpty();
    assertThat(publicLinkRepository.findByConnectionIdAndItemRef(connection.getId(), "file-1")).isEmpty();
  }
}
