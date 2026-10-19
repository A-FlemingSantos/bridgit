package com.bridgit.api.files;

import com.bridgit.api.common.error.ApiException;
import com.bridgit.api.common.error.NotFoundException;
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
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * Streams a folder and everything under it as a .zip, read straight from the provider.
 * Files the provider cannot hand over as bytes (native documents without an export) are left out
 * instead of failing the whole archive, since the response has already started by then.
 */
@Service
public class FolderArchiveService {

  private static final Logger log = LoggerFactory.getLogger(FolderArchiveService.class);

  private final ProviderConnectionService connectionService;
  private final ProviderRetryService retryService;
  private final CloudProviderClients clients;

  public FolderArchiveService(
      ProviderConnectionService connectionService,
      ProviderRetryService retryService,
      CloudProviderClients clients
  ) {
    this.connectionService = connectionService;
    this.retryService = retryService;
    this.clients = clients;
  }

  public void write(ContentTicketService.ContentTicket ticket, HttpServletResponse response) throws IOException {
    ProviderConnectionEntity connection = connectionService.findById(ticket.connectionId())
        .filter((found) -> ticket.userId().equals(found.getUserId()))
        .orElseThrow(FolderArchiveService::notFound);
    if (ticket.generation() != null && !Objects.equals(ticket.generation(), connection.getGeneration())) {
      throw new ApiException(HttpStatus.GONE, "CONTEUDO_EXPIRADO", "A conexão foi alterada. Baixe a pasta novamente.");
    }
    CloudProviderClient client = clients.get(CloudProvider.fromId(connection.getProvider()));
    CloudItem folder = retryService.withRetry(connection, token -> client.get(token, ticket.ref()));
    if (folder.kind() != ItemKind.FOLDER) throw notFound();

    String fileName = entryName(folder.name(), "pasta") + ".zip";
    String encoded = URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20");
    response.setContentType("application/zip");
    response.setHeader("Content-Disposition",
        "attachment; filename=\"" + fileName.replace("\"", "") + "\"; filename*=UTF-8''" + encoded);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "private, no-store");

    try (OutputStream output = response.getOutputStream(); ZipOutputStream zip = new ZipOutputStream(output)) {
      addFolder(zip, connection, client, folder.ref(), entryName(folder.name(), "pasta") + "/");
    }
  }

  private void addFolder(
      ZipOutputStream zip,
      ProviderConnectionEntity connection,
      CloudProviderClient client,
      String folderRef,
      String prefix
  ) throws IOException {
    zip.putNextEntry(new ZipEntry(prefix));
    zip.closeEntry();
    Set<String> taken = new HashSet<>();
    String cursor = null;
    do {
      String pageCursor = cursor;
      ItemPage page = retryService.withRetry(connection, token -> client.list(token, folderRef, pageCursor));
      for (CloudItem item : page.items()) {
        String name = unique(taken, entryName(item.name(), item.kind() == ItemKind.FOLDER ? "pasta" : "arquivo"));
        if (item.kind() == ItemKind.FOLDER) addFolder(zip, connection, client, item.ref(), prefix + name + "/");
        else addFile(zip, connection, client, item, prefix + name);
      }
      cursor = page.nextCursor();
    } while (StringUtils.hasText(cursor));
  }

  private void addFile(
      ZipOutputStream zip,
      ProviderConnectionEntity connection,
      CloudProviderClient client,
      CloudItem item,
      String path
  ) throws IOException {
    ContentStream stream;
    try {
      stream = retryService.withRetry(connection, token -> client.open(token, item, ContentVariant.ORIGINAL));
    } catch (RuntimeException ex) {
      log.info("Skipping {} in folder archive: {}", item.ref(), ex.getMessage());
      return;
    }
    try (stream; InputStream body = stream.body()) {
      zip.putNextEntry(new ZipEntry(path));
      body.transferTo(zip);
      zip.closeEntry();
    }
  }

  // A provider name may hold characters a path inside the zip cannot.
  private static String entryName(String name, String fallback) {
    String clean = name == null ? "" : name.replaceAll("[/\\\\\\x00-\\x1f]", "_").trim();
    return clean.isEmpty() || clean.equals(".") || clean.equals("..") ? fallback : clean;
  }

  // Two items with the same name in one folder (allowed by some providers) become "nome (2).ext".
  private static String unique(Set<String> taken, String name) {
    if (taken.add(name.toLowerCase())) return name;
    int dot = name.lastIndexOf('.');
    String stem = dot > 0 ? name.substring(0, dot) : name;
    String extension = dot > 0 ? name.substring(dot) : "";
    for (int index = 2; ; index++) {
      String candidate = stem + " (" + index + ")" + extension;
      if (taken.add(candidate.toLowerCase())) return candidate;
    }
  }

  private static NotFoundException notFound() {
    return new NotFoundException("CONTEUDO_NAO_ENCONTRADO", "Conteúdo não encontrado ou expirado.");
  }
}
