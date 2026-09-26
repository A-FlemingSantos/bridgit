package com.bridgit.api.files;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.bridgit.api.common.security.AuthenticatedUserService;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionService;
import com.bridgit.api.integrations.ProviderRetryService;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClient;
import com.bridgit.api.providers.CloudProviderClients;
import com.bridgit.api.providers.ItemKind;
import com.bridgit.api.providers.ProviderApiException;
import java.io.InputStream;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.InputStreamSource;
import org.springframework.http.HttpStatus;

class ProviderFileServiceUploadRetryTest {

  @Test
  void retryAfter401ResendsFullContent() throws Exception {
    UUID userId = UUID.randomUUID();
    AuthenticatedUserService auth = mock(AuthenticatedUserService.class);
    when(auth.requireUserId()).thenReturn(userId);

    ProviderConnectionEntity connection = new ProviderConnectionEntity();
    connection.setId(UUID.randomUUID());
    connection.setUserId(userId);
    connection.setProvider(CloudProvider.ONEDRIVE.id());

    ProviderConnectionService connections = mock(ProviderConnectionService.class);
    when(connections.requireConnection(userId, CloudProvider.ONEDRIVE)).thenReturn(connection);
    when(connections.accessToken(connection)).thenReturn("token-1", "token-2");

    byte[] data = new byte[4096];
    new Random(21).nextBytes(data);
    AtomicReference<byte[]> retriedBytes = new AtomicReference<>();

    CloudProviderClient client = mock(CloudProviderClient.class);
    when(client.upload(eq("token-1"), any(), any(), any(), eq((long) data.length), any()))
        .thenThrow(new ProviderApiException(HttpStatus.UNAUTHORIZED, "TOKEN_PROVEDOR_INVALIDO", "expirado"));
    when(client.upload(eq("token-2"), any(), any(), any(), eq((long) data.length), any()))
        .thenAnswer(invocation -> {
          InputStreamSource source = invocation.getArgument(5);
          try (InputStream in = source.getInputStream()) {
            retriedBytes.set(in.readAllBytes());
          }
          return new CloudItem("up", "onedrive", "a.bin", ItemKind.FILE,
              "application/octet-stream", "bin", (long) data.length, null, null);
        });

    CloudProviderClients clients = mock(CloudProviderClients.class);
    when(clients.get(CloudProvider.ONEDRIVE)).thenReturn(client);

    ProviderFileService service = new ProviderFileService(
        auth,
        connections,
        new ProviderRetryService(connections),
        clients,
        mock(ContentTicketService.class),
        mock(com.bridgit.api.providers.SealedCursorService.class),
        mock(ApplicationEventPublisher.class)
    );

    CloudItem item = service.uploadFile(
        CloudProvider.ONEDRIVE, null, "a.bin", "application/octet-stream", data.length,
        new ByteArrayResource(data));

    assertEquals("up", item.ref());
    assertArrayEquals(data, retriedBytes.get());
  }
}
