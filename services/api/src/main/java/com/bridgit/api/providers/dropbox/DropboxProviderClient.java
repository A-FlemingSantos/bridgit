package com.bridgit.api.providers.dropbox;

import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudItemSupport;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClient;
import com.bridgit.api.providers.ContentRange;
import com.bridgit.api.providers.ContentStream;
import com.bridgit.api.providers.ContentVariant;
import com.bridgit.api.providers.ItemKind;
import com.bridgit.api.providers.ItemPage;
import com.bridgit.api.providers.ProviderApiException;
import com.bridgit.api.providers.ProviderHttpSupport;
import com.bridgit.api.providers.ReadPlan;
import com.bridgit.api.providers.ReadPlanSupport;
import com.bridgit.api.providers.graph.NoRedirectClientHttpRequestFactory;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.springframework.core.io.InputStreamSource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

@Component
public class DropboxProviderClient implements CloudProviderClient {

  private static final String API_BASE = "https://api.dropboxapi.com/2";
  private static final String CONTENT_BASE = "https://content.dropboxapi.com/2";
  private static final int PAGE_SIZE = 200;

  private final RestClient apiClient;
  private final RestClient contentClient;
  private final ObjectMapper objectMapper;

  @Autowired
  public DropboxProviderClient(RestClient.Builder restClientBuilder, ObjectMapper objectMapper) {
    RestClient.Builder configured = restClientBuilder.requestFactory(NoRedirectClientHttpRequestFactory.create());
    this.apiClient = configured.build();
    this.contentClient = configured.build();
    this.objectMapper = objectMapper;
  }

  DropboxProviderClient(RestClient apiClient, RestClient contentClient, ObjectMapper objectMapper) {
    this.apiClient = apiClient;
    this.contentClient = contentClient;
    this.objectMapper = objectMapper;
  }

  @Override
  public CloudProvider provider() {
    return CloudProvider.DROPBOX;
  }

  @Override
  public ItemPage list(String accessToken, String parentRef, String cursor) {
    JsonNode json;
    if (StringUtils.hasText(cursor)) {
      json = rpc(accessToken, API_BASE + "/files/list_folder/continue", """
          {"cursor":"%s"}
          """.formatted(escapeJson(cursor)));
    } else {
      String path = StringUtils.hasText(parentRef) ? parentRef : "";
      json = rpc(accessToken, API_BASE + "/files/list_folder", """
          {"path":"%s","limit":%d,"include_mounted_folders":true}
          """.formatted(escapeJson(path), PAGE_SIZE));
    }

    String listedParent = resolveListedParent(parentRef);
    List<CloudItem> items = mapEntries(json.path("entries"), listedParent);
    String nextCursor = json.path("has_more").asBoolean(false)
        ? json.path("cursor").asText(null)
        : null;
    return new ItemPage(CloudItemSupport.sortItems(items), nextCursor);
  }

  private String resolveListedParent(String parentRef) {
    return StringUtils.hasText(parentRef) ? parentRef : null;
  }

  @Override
  public CloudItem get(String accessToken, String ref) {
    JsonNode json = rpc(accessToken, API_BASE + "/files/get_metadata", """
        {"path":"%s","include_media_info":false}
        """.formatted(escapeJson(ref)));
    return mapEntryWithResolvedParent(accessToken, json);
  }

  @Override
  public List<CloudItem> ancestry(String accessToken, String ref) {
    JsonNode metadata = rpc(accessToken, API_BASE + "/files/get_metadata", """
        {"path":"%s"}
        """.formatted(escapeJson(ref)));
    String pathDisplay = metadata.path("path_display").asText("");
    if (!StringUtils.hasText(pathDisplay) || "/".equals(pathDisplay)) {
      return List.of();
    }

    String[] segments = pathDisplay.split("/");
    List<CloudItem> path = new ArrayList<>();
    StringBuilder currentPath = new StringBuilder();

    for (int i = 1; i < segments.length - 1; i++) {
      currentPath.append('/').append(segments[i]);
      JsonNode ancestor = rpc(accessToken, API_BASE + "/files/get_metadata", """
          {"path":"%s"}
          """.formatted(escapeJson(currentPath.toString())));
      path.add(new CloudItem(
          ancestor.path("id").asText(),
          CloudProvider.DROPBOX.id(),
          ancestor.path("name").asText(),
          ItemKind.FOLDER,
          null,
          null,
          null,
          parseClientModified(ancestor.path("client_modified").asText(null)),
          null,
          false
      ));
    }

    return path;
  }

  @Override
  public CloudItem createFolder(String accessToken, String parentRef, String name) {
    String parentPath = resolveParentPath(accessToken, parentRef);
    String targetPath = parentPath.isEmpty() ? "/" + name : parentPath + "/" + name;
    JsonNode json = rpc(accessToken, API_BASE + "/files/create_folder_v2", """
        {"path":"%s","autorename":true}
        """.formatted(escapeJson(targetPath)));
    return mapEntry(json.path("metadata"), listedParentRef(parentRef));
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
    String parentPath = resolveParentPath(accessToken, parentRef);
    String targetPath = parentPath.isEmpty() ? "/" + name : parentPath + "/" + name;
    String apiArg = """
        {"path":"%s","mode":"add","autorename":true}
        """.formatted(escapeJson(targetPath));

    JsonNode json = contentClient.post()
        .uri(CONTENT_BASE + "/files/upload")
        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
        .header("Dropbox-API-Arg", escapeApiArg(apiArg))
        .contentType(MediaType.APPLICATION_OCTET_STREAM)
        .contentLength(size)
        .body((org.springframework.http.StreamingHttpOutputMessage.Body) out -> {
          try (InputStream in = content.getInputStream()) {
            in.transferTo(out);
          }
        })
        .exchange((request, response) -> {
          ensureSuccess(response);
          try {
            return objectMapper.readTree(response.getBody());
          } catch (Exception ex) {
            throw new ProviderApiException("Nao foi possivel enviar o arquivo.");
          }
        });
    return mapEntry(json, listedParentRef(parentRef));
  }

  @Override
  public CloudItem update(String accessToken, String ref, String newName, String newParentRef) {
    JsonNode current = rpc(accessToken, API_BASE + "/files/get_metadata", """
        {"path":"%s"}
        """.formatted(escapeJson(ref)));

    String currentPath = current.path("path_display").asText();
    String parentPath;
    String parentRef;
    if (newParentRef != null) {
      parentPath = newParentRef.isBlank() ? "" : resolveParentPath(accessToken, newParentRef);
      parentRef = newParentRef.isBlank() ? null : newParentRef;
    } else {
      parentPath = parentDirectory(currentPath);
      parentRef = null;
    }

    String fileName = StringUtils.hasText(newName) ? newName : current.path("name").asText();
    String targetPath = parentPath.isEmpty() ? "/" + fileName : parentPath + "/" + fileName;

    JsonNode json = rpc(accessToken, API_BASE + "/files/move_v2", """
        {"from_path":"%s","to_path":"%s","autorename":true}
        """.formatted(escapeJson(ref), escapeJson(targetPath)));
    JsonNode metadata = json.path("metadata");
    if (newParentRef != null) {
      return mapEntry(metadata, parentRef);
    }
    return mapEntryWithResolvedParent(accessToken, metadata);
  }

  @Override
  public void delete(String accessToken, String ref) {
    rpc(accessToken, API_BASE + "/files/delete_v2", """
        {"path":"%s"}
        """.formatted(escapeJson(ref)));
  }

  @Override
  public ReadPlan readPlan(CloudItem item) {
    return ReadPlanSupport.readPlan(CloudProvider.DROPBOX, item);
  }

  @Override
  public ContentStream open(String accessToken, CloudItem item, ContentVariant variant) {
    if (variant == ContentVariant.READ) {
      return contentDownload(
          accessToken,
          CONTENT_BASE + "/files/get_preview",
          item.ref(),
          item.name(),
          "application/pdf",
          null
      );
    }
    return contentDownload(
        accessToken,
        CONTENT_BASE + "/files/download",
        item.ref(),
        item.name(),
        StringUtils.hasText(item.mimeType()) ? item.mimeType() : "application/octet-stream",
        null
    );
  }

  @Override
  public ContentStream open(String accessToken, CloudItem item, ContentVariant variant, ContentRange range) {
    if (variant != ContentVariant.ORIGINAL || range == null) {
      return open(accessToken, item, variant);
    }
    ContentStream unsatisfiable = unsatisfiableRange(item, range);
    if (unsatisfiable != null) {
      return unsatisfiable;
    }
    return contentDownload(
        accessToken,
        CONTENT_BASE + "/files/download",
        item.ref(),
        item.name(),
        StringUtils.hasText(item.mimeType()) ? item.mimeType() : "application/octet-stream",
        range.headerValue()
    );
  }

  static ContentStream unsatisfiableRange(CloudItem item, ContentRange range) {
    Long size = item.size();
    if (size == null || size < 0 || range.start() < size) {
      return null;
    }
    return new ContentStream(
        new ByteArrayInputStream(new byte[0]),
        StringUtils.hasText(item.mimeType()) ? item.mimeType() : "application/octet-stream",
        0L,
        item.name(),
        416,
        "bytes */" + size,
        size
    );
  }

  @Override
  public List<CloudItem> search(String accessToken, String query, int limit) {
    JsonNode json = rpc(accessToken, API_BASE + "/files/search_v2", """
        {"query":"%s","options":{"max_results":%d}}
        """.formatted(escapeJson(query), Math.min(limit, PAGE_SIZE)));
    List<CloudItem> results = new ArrayList<>();
    json.path("matches").forEach(match -> {
      JsonNode metadata = match.path("metadata").path("metadata");
      if (!metadata.isMissingNode()) {
        results.add(mapUnknownParent(metadata));
      }
    });
    return results.stream().limit(limit).toList();
  }

  private ContentStream contentDownload(
      String accessToken,
      String url,
      String ref,
      String fileName,
      String contentType,
      String rangeHeader
  ) {
    String apiArg = "{\"path\":\"" + escapeJson(ref) + "\"}";
    ClientHttpResponse response = contentClient.post()
        .uri(url)
        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
        .header("Dropbox-API-Arg", escapeApiArg(apiArg))
        .headers(headers -> {
          if (rangeHeader != null) {
            headers.set(HttpHeaders.RANGE, rangeHeader);
          }
        })
        .exchange((request, resp) -> {
          ensureSuccessOrRange(resp);
          return resp;
        }, false);
    return toContentStream(response, fileName, contentType);
  }

  private JsonNode rpc(String accessToken, String url, String body) {
    return apiClient.post()
        .uri(url)
        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
        .contentType(MediaType.APPLICATION_JSON)
        .body(body)
        .exchange((request, response) -> {
          ensureSuccess(response);
          try {
            return objectMapper.readTree(response.getBody());
          } catch (Exception ex) {
            throw new ProviderApiException("Resposta invalida do provedor.");
          }
        });
  }

  private String resolveParentPath(String accessToken, String parentRef) {
    if (!StringUtils.hasText(parentRef)) {
      return "";
    }
    JsonNode metadata = rpc(accessToken, API_BASE + "/files/get_metadata", """
        {"path":"%s"}
        """.formatted(escapeJson(parentRef)));
    return metadata.path("path_display").asText("");
  }

  private static String listedParentRef(String parentRef) {
    return StringUtils.hasText(parentRef) ? parentRef : null;
  }

  private List<CloudItem> mapEntries(JsonNode entries, String listedParent) {
    List<CloudItem> items = new ArrayList<>();
    if (!entries.isArray()) {
      return items;
    }
    entries.forEach(entry -> items.add(mapEntry(entry, listedParent)));
    return items;
  }

  private CloudItem mapEntry(JsonNode node, String parentRef) {
    String tag = node.path(".tag").asText();
    boolean folder = "folder".equals(tag);
    String name = node.path("name").asText(null);
    String id = node.path("id").asText(null);
    Long size = folder ? null : node.path("size").asLong(0);
    if (!folder && node.path("size").isMissingNode()) {
      size = null;
    }

    return new CloudItem(
        id,
        CloudProvider.DROPBOX.id(),
        name,
        folder ? ItemKind.FOLDER : ItemKind.FILE,
        folder ? null : guessMime(name),
        CloudItemSupport.extensionFromName(name),
        size,
        parseClientModified(node.path("client_modified").asText(null)),
        parentRef,
        true
    );
  }

  private CloudItem mapEntryWithResolvedParent(String accessToken, JsonNode node) {
    String pathDisplay = node.path("path_display").asText("");
    String parentDir = parentDirectory(pathDisplay);
    if (parentDir.isEmpty()) {
      return withParent(node, null);
    }
    JsonNode parentMeta = rpc(accessToken, API_BASE + "/files/get_metadata", """
        {"path":"%s"}
        """.formatted(escapeJson(parentDir)));
    String parentId = parentMeta.path("id").asText(null);
    return withParent(node, parentId);
  }

  private CloudItem withParent(JsonNode node, String parentId) {
    CloudItem mapped = mapEntry(node, parentId);
    return new CloudItem(
        mapped.ref(),
        mapped.provider(),
        mapped.name(),
        mapped.kind(),
        mapped.mimeType(),
        mapped.extension(),
        mapped.size(),
        mapped.modifiedAt(),
        parentId,
        true
    );
  }

  private static CloudItem mapUnknownParent(JsonNode node) {
    String tag = node.path(".tag").asText();
    boolean folder = "folder".equals(tag);
    String name = node.path("name").asText(null);

    return new CloudItem(
        node.path("id").asText(null),
        CloudProvider.DROPBOX.id(),
        name,
        folder ? ItemKind.FOLDER : ItemKind.FILE,
        folder ? null : guessMime(name),
        CloudItemSupport.extensionFromName(name),
        folder ? null : node.path("size").asLong(0),
        parseClientModified(node.path("client_modified").asText(null)),
        null,
        false
    );
  }

  private static String guessMime(String name) {
    String ext = CloudItemSupport.extensionFromName(name);
    if (ext == null) {
      return "application/octet-stream";
    }
    return switch (ext) {
      case "pdf" -> "application/pdf";
      case "png" -> "image/png";
      case "jpg", "jpeg" -> "image/jpeg";
      case "gif" -> "image/gif";
      case "txt" -> "text/plain";
      case "html", "htm" -> "text/html";
      case "json" -> "application/json";
      case "xml" -> "application/xml";
      case "mp4" -> "video/mp4";
      case "mp3" -> "audio/mpeg";
      default -> "application/octet-stream";
    };
  }

  private static String parentDirectory(String pathDisplay) {
    if (!StringUtils.hasText(pathDisplay) || "/".equals(pathDisplay)) {
      return "";
    }
    int slash = pathDisplay.lastIndexOf('/');
    if (slash <= 0) {
      return "";
    }
    return pathDisplay.substring(0, slash);
  }

  private static OffsetDateTime parseClientModified(String value) {
    if (!StringUtils.hasText(value)) {
      return null;
    }
    return OffsetDateTime.ofInstant(Instant.parse(value), ZoneOffset.UTC);
  }

  static String escapeApiArg(String json) {
    StringBuilder out = new StringBuilder(json.length());
    for (int i = 0; i < json.length(); i++) {
      char ch = json.charAt(i);
      if (ch > 127) {
        out.append(String.format("\\u%04x", (int) ch));
      } else {
        out.append(ch);
      }
    }
    return out.toString();
  }

  static ContentStream toContentStream(ClientHttpResponse response, String fileName, String contentType) {
    try {
      int status = response.getStatusCode().value();
      HttpHeaders headers = response.getHeaders();
      if (status == 416) {
        String contentRange = headers.getFirst(HttpHeaders.CONTENT_RANGE);
        long total = parseTotal(contentRange);
        response.close();
        return new ContentStream(
            new ByteArrayInputStream(new byte[0]),
            contentType,
            0L,
            fileName,
            416,
            contentRange != null ? contentRange : "bytes */" + total,
            total
        );
      }
      Long length = headers.getContentLength();
      InputStream body = response.getBody();
      if (status == 206) {
        String contentRange = headers.getFirst(HttpHeaders.CONTENT_RANGE);
        return new ContentStream(
            body,
            contentType,
            length >= 0 ? length : null,
            fileName,
            206,
            contentRange,
            parseTotal(contentRange)
        );
      }
      return new ContentStream(body, contentType, length >= 0 ? length : null, fileName);
    } catch (ProviderApiException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new ProviderApiException("Nao foi possivel abrir o conteudo.");
    }
  }

  private static long parseTotal(String contentRange) {
    if (contentRange != null) {
      int slash = contentRange.lastIndexOf('/');
      if (slash >= 0) {
        try {
          return Long.parseLong(contentRange.substring(slash + 1).trim());
        } catch (NumberFormatException ignored) {
        }
      }
    }
    return -1L;
  }

  private static void ensureSuccess(ClientHttpResponse response) {
    try {
      HttpStatusCode status = response.getStatusCode();
      if (!status.isError()) {
        return;
      }
      HttpHeaders headers = response.getHeaders();
      String body = readBody(response);
      response.close();
      ProviderHttpSupport.throwOnError(status, headers, body, CloudProvider.DROPBOX);
    } catch (ProviderApiException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new ProviderApiException("Nao foi possivel concluir a operacao.");
    }
  }

  private static void ensureSuccessOrRange(ClientHttpResponse response) {
    try {
      if (response.getStatusCode().value() == 416) {
        return;
      }
    } catch (Exception ex) {
      throw new ProviderApiException("Nao foi possivel concluir a operacao.");
    }
    ensureSuccess(response);
  }

  private static String readBody(ClientHttpResponse response) {
    try (InputStream input = response.getBody()) {
      return new String(input.readAllBytes(), StandardCharsets.UTF_8);
    } catch (Exception ex) {
      return "";
    }
  }

  private static String bearer(String accessToken) {
    return "Bearer " + accessToken;
  }

  private static String escapeJson(String value) {
    return value.replace("\\", "\\\\").replace("\"", "\\\"");
  }
}
