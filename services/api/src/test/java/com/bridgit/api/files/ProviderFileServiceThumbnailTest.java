package com.bridgit.api.files;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bridgit.api.common.error.NotFoundException;
import com.bridgit.api.common.security.AuthenticatedUserService;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionService;
import com.bridgit.api.integrations.ProviderRetryService;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClient;
import com.bridgit.api.providers.CloudProviderClients;
import com.bridgit.api.providers.ContentStream;
import com.bridgit.api.providers.ItemKind;
import java.io.ByteArrayInputStream;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

class ProviderFileServiceThumbnailTest {

  @Test
  void ineligibleFileIsNotFoundWithoutAskingForAThumbnail() {
    Harness harness = harness(CloudProvider.ONEDRIVE);
    when(harness.client.get("token", "note")).thenReturn(file("notes.zip", "application/zip", "zip"));

    assertThrows(NotFoundException.class, () -> harness.service.openThumbnail(CloudProvider.ONEDRIVE, "note"));
    verify(harness.client, never()).openThumbnail(any(), any());
  }

  @Test
  void dropboxOfficeIsNotFoundWithoutAskingForAThumbnail() {
    Harness harness = harness(CloudProvider.DROPBOX);
    when(harness.client.get("token", "doc")).thenReturn(file("a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"));

    assertThrows(NotFoundException.class, () -> harness.service.openThumbnail(CloudProvider.DROPBOX, "doc"));
    verify(harness.client, never()).openThumbnail(any(), any());
  }

  @Test
  void eligibleImageOpensTheProviderThumbnail() {
    Harness harness = harness(CloudProvider.ONEDRIVE);
    CloudItem item = file("a.jpg", "image/jpeg", "jpg");
    ContentStream stream = new ContentStream(new ByteArrayInputStream(new byte[] {1}), "image/jpeg", 1L, "a.jpg");
    when(harness.client.get("token", "photo")).thenReturn(item);
    when(harness.client.openThumbnail("token", item)).thenReturn(stream);

    assertSame(stream, harness.service.openThumbnail(CloudProvider.ONEDRIVE, "photo"));
  }

  @Test
  void catalogedItemOpensTheThumbnailWithoutReadingItsMetadataFromTheCloud() {
    Harness harness = harness(CloudProvider.ONEDRIVE);
    CloudItem item = file("a.jpg", "image/jpeg", "jpg");
    ContentStream stream = new ContentStream(new ByteArrayInputStream(new byte[] {1}), "image/jpeg", 1L, "a.jpg");
    com.bridgit.api.catalog.CatalogService catalog = mock(com.bridgit.api.catalog.CatalogService.class);
    when(catalog.enabled(harness.client)).thenReturn(true);
    when(catalog.known(any(), org.mockito.ArgumentMatchers.eq("photo"))).thenReturn(item);
    harness.service.configureLocalHub(catalog, null, null);
    when(harness.client.openThumbnail("token", item)).thenReturn(stream);

    assertSame(stream, harness.service.openThumbnail(CloudProvider.ONEDRIVE, "photo"));
    verify(harness.client, never()).get(any(), any());
  }

  @Test
  void itemMissingFromTheCatalogIsReadFromTheCloud() {
    Harness harness = harness(CloudProvider.ONEDRIVE);
    CloudItem item = file("a.jpg", "image/jpeg", "jpg");
    ContentStream stream = new ContentStream(new ByteArrayInputStream(new byte[] {1}), "image/jpeg", 1L, "a.jpg");
    com.bridgit.api.catalog.CatalogService catalog = mock(com.bridgit.api.catalog.CatalogService.class);
    when(catalog.enabled(harness.client)).thenReturn(true);
    harness.service.configureLocalHub(catalog, null, null);
    when(harness.client.get("token", "photo")).thenReturn(item);
    when(harness.client.openThumbnail("token", item)).thenReturn(stream);

    assertSame(stream, harness.service.openThumbnail(CloudProvider.ONEDRIVE, "photo"));
  }

  private static CloudItem file(String name, String mime, String extension) {
    return new CloudItem("ref", "provider", name, ItemKind.FILE, mime, extension, 10L, null, null);
  }

  private static Harness harness(CloudProvider provider) {
    UUID userId = UUID.randomUUID();
    AuthenticatedUserService auth = mock(AuthenticatedUserService.class);
    when(auth.requireUserId()).thenReturn(userId);
    ProviderConnectionEntity connection = new ProviderConnectionEntity();
    connection.setId(UUID.randomUUID());
    connection.setUserId(userId);
    connection.setProvider(provider.id());
    ProviderConnectionService connections = mock(ProviderConnectionService.class);
    when(connections.requireConnection(userId, provider)).thenReturn(connection);
    when(connections.accessToken(connection)).thenReturn("token");
    CloudProviderClient client = mock(CloudProviderClient.class);
    CloudProviderClients clients = mock(CloudProviderClients.class);
    when(clients.get(provider)).thenReturn(client);
    ProviderFileService service = new ProviderFileService(
        auth,
        connections,
        new ProviderRetryService(connections),
        clients,
        mock(ContentTicketService.class),
        mock(com.bridgit.api.providers.SealedCursorService.class),
        mock(ApplicationEventPublisher.class)
    );
    return new Harness(service, client);
  }

  private record Harness(ProviderFileService service, CloudProviderClient client) {
  }
}
