package com.bridgit.api.files;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.bridgit.api.common.error.ApiException;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionService;
import com.bridgit.api.integrations.ProviderRetryService;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClient;
import com.bridgit.api.providers.CloudProviderClients;
import com.bridgit.api.providers.ContentStream;
import com.bridgit.api.providers.ContentVariant;
import com.bridgit.api.providers.ItemKind;
import com.bridgit.api.providers.ItemPage;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;

class FolderArchiveServiceTest {

  private final UUID userId = UUID.randomUUID();
  private final UUID connectionId = UUID.randomUUID();
  private final CloudProviderClient client = mock(CloudProviderClient.class);
  private final ProviderConnectionService connections = mock(ProviderConnectionService.class);
  private FolderArchiveService service;

  @BeforeEach
  void setUp() {
    ProviderConnectionEntity connection = new ProviderConnectionEntity();
    connection.setUserId(userId);
    connection.setProvider(CloudProvider.ONEDRIVE.id());
    connection.setGeneration(3);
    when(connections.findById(connectionId)).thenReturn(Optional.of(connection));
    when(connections.accessToken(any())).thenReturn("tok");
    CloudProviderClients clients = mock(CloudProviderClients.class);
    when(clients.get(CloudProvider.ONEDRIVE)).thenReturn(client);
    service = new FolderArchiveService(connections, new ProviderRetryService(connections), clients);

    when(client.get("tok", "root-folder")).thenReturn(folder("root-folder", "Relatórios"));
    when(client.list(eq("tok"), eq("root-folder"), isNull())).thenReturn(new ItemPage(
        List.of(file("a", "a.txt"), file("b", "A.txt"), folder("sub", "Anexos"), file("gdoc", "Nativo")),
        null));
    when(client.list(eq("tok"), eq("sub"), isNull())).thenReturn(new ItemPage(List.of(file("c", "c.txt")), null));
    when(client.open(eq("tok"), any(), eq(ContentVariant.ORIGINAL))).thenAnswer((call) -> {
      CloudItem item = call.getArgument(1);
      if (item.ref().equals("gdoc")) throw new IllegalStateException("not downloadable");
      return new ContentStream(new ByteArrayInputStream(item.ref().getBytes(StandardCharsets.UTF_8)), "text/plain", 1L, item.name());
    });
  }

  @Test
  void zipsTheFolderTreeAndSkipsWhatCannotBeRead() throws Exception {
    MockHttpServletResponse response = new MockHttpServletResponse();
    service.write(ticket(3L), response);

    assertThat(response.getContentType()).isEqualTo("application/zip");
    assertThat(response.getHeader("Content-Disposition")).contains("attachment").contains("Relat%C3%B3rios.zip");

    Map<String, String> entries = new LinkedHashMap<>();
    try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(response.getContentAsByteArray()))) {
      for (ZipEntry entry = zip.getNextEntry(); entry != null; entry = zip.getNextEntry()) {
        entries.put(entry.getName(), new String(zip.readAllBytes(), StandardCharsets.UTF_8));
      }
    }
    assertThat(entries).containsExactly(
        Map.entry("Relatórios/", ""),
        Map.entry("Relatórios/a.txt", "a"),
        Map.entry("Relatórios/A (2).txt", "b"),
        Map.entry("Relatórios/Anexos/", ""),
        Map.entry("Relatórios/Anexos/c.txt", "c"));
  }

  @Test
  void refusesATicketFromAnEarlierConnection() {
    assertThatThrownBy(() -> service.write(ticket(2L), new MockHttpServletResponse()))
        .isInstanceOf(ApiException.class);
  }

  private ContentTicketService.ContentTicket ticket(Long generation) {
    return new ContentTicketService.ContentTicket(
        userId, connectionId, "root-folder", ContentVariant.ORIGINAL, "archive", generation, null);
  }

  private static CloudItem folder(String ref, String name) {
    return new CloudItem(ref, "onedrive", name, ItemKind.FOLDER, null, null, null, null, null);
  }

  private static CloudItem file(String ref, String name) {
    return new CloudItem(ref, "onedrive", name, ItemKind.FILE, "text/plain", null, 1L, null, null);
  }
}
