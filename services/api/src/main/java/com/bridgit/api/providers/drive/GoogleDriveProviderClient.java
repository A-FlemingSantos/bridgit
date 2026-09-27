package com.bridgit.api.providers.drive;

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
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
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
public class GoogleDriveProviderClient implements CloudProviderClient {

  private static final String DRIVE_BASE = "https://www.googleapis.com/drive/v3";
  private static final String UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
  static final String LIST_FIELDS =
      "nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)";
  static final String ITEM_FIELDS = "id,name,mimeType,size,modifiedTime,parents";
  private static final int PAGE_SIZE = 200;
  static final long MULTIPART_MAX = 5L * 1024L * 1024L;

  private final RestClient restClient;
  private final ObjectMapper objectMapper;

  @Autowired
  public GoogleDriveProviderClient(RestClient.Builder restClientBuilder, ObjectMapper objectMapper) {
    this.restClient = restClientBuilder.requestFactory(NoRedirectClientHttpRequestFactory.create()).build();
    this.objectMapper = objectMapper;
  }

  GoogleDriveProviderClient(RestClient restClient, ObjectMapper objectMapper) {
    this.restClient = restClient;
    this.objectMapper = objectMapper;
  }

  @Override
  public CloudProvider provider() {
    return CloudProvider.GOOGLE_DRIVE;
  }

  @Override
  public ItemPage list(String accessToken, String parentRef, String cursor) {
    String parent = resolveParent(accessToken, parentRef);
    String q = "'" + escapeQuery(parent) + "' in parents and trashed=false";
    String url = DRIVE_BASE + "/files?q=" + urlEncode(q)
        + "&fields=" + urlEncode(LIST_FIELDS)
        + "&pageSize=" + PAGE_SIZE
        + "&orderBy=folder,name"
        + "&supportsAllDrives=true";

    if (StringUtils.hasText(cursor)) {
      url += "&pageToken=" + urlEncode(cursor);
    }

    JsonNode json = authorizedGet(accessToken, url);
    List<CloudItem> items = mapListed(json.path("files"), parentRef);
    String nextPageToken = json.path("nextPageToken").asText(null);
    return new ItemPage(CloudItemSupport.sortItems(items), nextPageToken);
  }

  @Override
  public CloudItem get(String accessToken, String ref) {
    JsonNode json = authorizedGet(
        accessToken,
        DRIVE_BASE + "/files/" + ref + "?fields=" + urlEncode(ITEM_FIELDS) + "&supportsAllDrives=true"
    );
    return mapFile(json, fetchRootId(accessToken));
  }

  @Override
  public List<CloudItem> ancestry(String accessToken, String ref) {
    String rootId = fetchRootId(accessToken);
    JsonNode item = authorizedGet(
        accessToken,
        DRIVE_BASE + "/files/" + ref + "?fields=" + urlEncode("id,name,parents") + "&supportsAllDrives=true"
    );
    String parentId = firstParent(item);
    if (!StringUtils.hasText(parentId) || rootId.equals(parentId)) {
      return List.of();
    }

    List<CloudItem> path = new ArrayList<>();
    String current = parentId;
    while (StringUtils.hasText(current) && !rootId.equals(current)) {
      JsonNode node = authorizedGet(
          accessToken,
          DRIVE_BASE + "/files/" + current + "?fields=" + urlEncode("id,name,parents") + "&supportsAllDrives=true"
      );
      String nodeParent = firstParent(node);
      path.add(new CloudItem(
          node.path("id").asText(),
          CloudProvider.GOOGLE_DRIVE.id(),
          node.path("name").asText(),
          ItemKind.FOLDER,
          "application/vnd.google-apps.folder",
          null,
          null,
          null,
          !StringUtils.hasText(nodeParent) || rootId.equals(nodeParent) ? null : nodeParent,
          true
      ));
      if (!StringUtils.hasText(nodeParent)) {
        break;
      }
      current = nodeParent;
    }

    Collections.reverse(path);
    return path;
  }

  @Override
  public CloudItem createFolder(String accessToken, String parentRef, String name) {
    String parent = resolveParent(accessToken, parentRef);
    String body = """
        {"name":"%s","mimeType":"application/vnd.google-apps.folder","parents":["%s"]}
        """.formatted(escapeJson(name), escapeJson(parent));

    JsonNode json = authorizedPostJson(
        accessToken,
        DRIVE_BASE + "/files?fields=" + urlEncode(ITEM_FIELDS) + "&supportsAllDrives=true",
        body
    );
    return mapCreated(json, parentRef);
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
    String parent = resolveParent(accessToken, parentRef);
    if (size <= MULTIPART_MAX) {
      return multipartUpload(accessToken, parent, parentRef, name, contentType, size, content);
    }
    return resumableUpload(accessToken, parent, parentRef, name, contentType, size, content);
  }

  @Override
  public CloudItem update(String accessToken, String ref, String newName, String newParentRef) {
    String url = DRIVE_BASE + "/files/" + ref + "?fields=" + urlEncode(ITEM_FIELDS) + "&supportsAllDrives=true";
    String targetParent = null;
    if (newParentRef != null) {
      CloudItem current = get(accessToken, ref);
      targetParent = newParentRef.isBlank() ? fetchRootId(accessToken) : newParentRef;
      String removeParents = current.parentRef() == null ? "" : current.parentRef();
      url += "&addParents=" + urlEncode(targetParent);
      if (StringUtils.hasText(removeParents)) {
        url += "&removeParents=" + urlEncode(removeParents);
      }
    }

    String body = newName == null ? "{}" : "{\"name\":\"" + escapeJson(newName) + "\"}";
    JsonNode json = authorizedPatchJson(accessToken, url, body);
    if (newParentRef != null) {
      return mapCreated(json, newParentRef.isBlank() ? null : newParentRef);
    }
    return mapFile(json, fetchRootId(accessToken));
  }

  @Override
  public void delete(String accessToken, String ref) {
    authorizedPatchJson(accessToken, DRIVE_BASE + "/files/" + ref + "?supportsAllDrives=true", "{\"trashed\":true}");
  }

  @Override
  public ReadPlan readPlan(CloudItem item) {
    return ReadPlanSupport.readPlan(CloudProvider.GOOGLE_DRIVE, item);
  }

  @Override
  public ContentStream open(String accessToken, CloudItem item, ContentVariant variant) {
    if (variant == ContentVariant.READ) {
      return exportStream(accessToken, item.ref(), "application/pdf", item.name(), "application/pdf", null);
    }

    if (ReadPlanSupport.isGoogleNative(item.mimeType())) {
      ExportTarget target = officeExportTarget(item.mimeType(), item.name());
      return exportStream(accessToken, item.ref(), target.mimeType(), target.fileName(), target.mimeType(), null);
    }

    return mediaStream(accessToken, item.ref(), item.name(), item.mimeType(), null);
  }

  @Override
  public ContentStream open(String accessToken, CloudItem item, ContentVariant variant, ContentRange range) {
    if (variant != ContentVariant.ORIGINAL || range == null) {
      return open(accessToken, item, variant);
    }
    if (ReadPlanSupport.isGoogleNative(item.mimeType())) {
      return open(accessToken, item, variant);
    }
    ContentStream unsatisfiable = unsatisfiableRange(item, range);
    if (unsatisfiable != null) {
      return unsatisfiable;
    }
    return mediaStream(accessToken, item.ref(), item.name(), item.mimeType(), range.headerValue());
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
    String q = "name contains '" + escapeQuery(query) + "' and trashed=false";
    String url = DRIVE_BASE + "/files?q=" + urlEncode(q)
        + "&fields=" + urlEncode(LIST_FIELDS)
        + "&pageSize=" + Math.min(limit, PAGE_SIZE)
        + "&supportsAllDrives=true&includeItemsFromAllDrives=true";
    JsonNode json = authorizedGet(accessToken, url);
    List<CloudItem> results = new ArrayList<>();
    JsonNode files = json.path("files");
    if (files.isArray()) {
      files.forEach(node -> results.add(mapUnknownParent(node)));
    }
    return results.stream().limit(limit).toList();
  }

  private CloudItem multipartUpload(
      String accessToken,
      String parent,
      String parentRef,
      String name,
      String contentType,
      long size,
      InputStreamSource content
  ) {
    String metadata = """
        {"name":"%s","parents":["%s"]}
        """.formatted(escapeJson(name), escapeJson(parent));
    String boundary = "bridgit-" + System.nanoTime();
    MediaType mediaType = StringUtils.hasText(contentType)
        ? MediaType.parseMediaType(contentType)
        : MediaType.APPLICATION_OCTET_STREAM;

    byte[] head = multipartHead(boundary, metadata, mediaType.toString());
    byte[] tail = ("\r\n--" + boundary + "--").getBytes(StandardCharsets.UTF_8);

    JsonNode json = restClient.post()
        .uri(URI.create(UPLOAD_BASE + "/files?uploadType=multipart&fields=" + urlEncode(ITEM_FIELDS)))
        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
        .contentType(MediaType.parseMediaType("multipart/related; boundary=" + boundary))
        .contentLength(head.length + size + tail.length)
        .body((org.springframework.http.StreamingHttpOutputMessage.Body) out -> {
          out.write(head);
          try (InputStream in = content.getInputStream()) {
            in.transferTo(out);
          }
          out.write(tail);
        })
        .exchange((request, response) -> {
          ensureSuccess(response);
          try {
            return objectMapper.readTree(response.getBody());
          } catch (Exception ex) {
            throw new ProviderApiException("Nao foi possivel enviar o arquivo.");
          }
        });
    return mapCreated(json, parentRef);
  }

  static byte[] multipartHead(String boundary, String metadata, String contentType) {
    String preamble = "--" + boundary + "\r\n"
        + "Content-Type: application/json; charset=UTF-8\r\n\r\n"
        + metadata + "\r\n"
        + "--" + boundary + "\r\n"
        + "Content-Type: " + contentType + "\r\n\r\n";
    return preamble.getBytes(StandardCharsets.UTF_8);
  }

  private CloudItem resumableUpload(
      String accessToken,
      String parent,
      String parentRef,
      String name,
      String contentType,
      long size,
      InputStreamSource content
  ) {
    String metadata = """
        {"name":"%s","parents":["%s"]}
        """.formatted(escapeJson(name), escapeJson(parent));

    String uploadUrl = restClient.post()
        .uri(URI.create(UPLOAD_BASE + "/files?uploadType=resumable&fields=" + urlEncode(ITEM_FIELDS)))
        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
        .contentType(MediaType.APPLICATION_JSON)
        .body(metadata)
        .exchange((request, response) -> {
          ensureSuccess(response);
          String location = response.getHeaders().getFirst(HttpHeaders.LOCATION);
          response.close();
          if (!StringUtils.hasText(location)) {
            throw new ProviderApiException("Nao foi possivel iniciar o envio do arquivo.");
          }
          return location;
        });

    MediaType mediaType = StringUtils.hasText(contentType)
        ? MediaType.parseMediaType(contentType)
        : MediaType.APPLICATION_OCTET_STREAM;
    JsonNode json = restClient.put()
        .uri(URI.create(uploadUrl))
        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
        .contentLength(size)
        .contentType(mediaType)
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
            throw new ProviderApiException("Nao foi possivel concluir o envio do arquivo.");
          }
        });
    return mapCreated(json, parentRef);
  }

  private ContentStream exportStream(
      String accessToken,
      String ref,
      String exportMime,
      String fileName,
      String contentType,
      String rangeHeader
  ) {
    String url = DRIVE_BASE + "/files/" + ref + "/export?mimeType=" + urlEncode(exportMime);
    ClientHttpResponse response = restClient.get()
        .uri(URI.create(url))
        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
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

  private ContentStream mediaStream(
      String accessToken,
      String ref,
      String fileName,
      String contentType,
      String rangeHeader
  ) {
    String url = DRIVE_BASE + "/files/" + ref + "?alt=media&supportsAllDrives=true";
    ClientHttpResponse response = restClient.get()
        .uri(URI.create(url))
        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
        .headers(headers -> {
          if (rangeHeader != null) {
            headers.set(HttpHeaders.RANGE, rangeHeader);
          }
        })
        .exchange((request, resp) -> {
          ensureSuccessOrRange(resp);
          return resp;
        }, false);
    String resolvedType = StringUtils.hasText(contentType) ? contentType : "application/octet-stream";
    return toContentStream(response, fileName, resolvedType);
  }

  private JsonNode authorizedGet(String accessToken, String url) {
    return restClient.get()
        .uri(URI.create(url))
        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
        .exchange((request, response) -> {
          ensureSuccess(response);
          try {
            return objectMapper.readTree(response.getBody());
          } catch (Exception ex) {
            throw new ProviderApiException("Resposta invalida do provedor.");
          }
        });
  }

  private JsonNode authorizedPostJson(String accessToken, String url, String body) {
    return restClient.post()
        .uri(URI.create(url))
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

  private JsonNode authorizedPatchJson(String accessToken, String url, String body) {
    return restClient.patch()
        .uri(URI.create(url))
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

  private String resolveParent(String accessToken, String parentRef) {
    if (!StringUtils.hasText(parentRef)) {
      return fetchRootId(accessToken);
    }
    return parentRef;
  }

  private String fetchRootId(String accessToken) {
    JsonNode json = authorizedGet(accessToken, DRIVE_BASE + "/files/root?fields=id");
    return json.path("id").asText();
  }

  private static String firstParent(JsonNode node) {
    JsonNode parents = node.path("parents");
    if (parents.isArray() && !parents.isEmpty()) {
      return parents.get(0).asText(null);
    }
    return null;
  }

  private List<CloudItem> mapListed(JsonNode files, String listedParentRef) {
    List<CloudItem> items = new ArrayList<>();
    if (!files.isArray()) {
      return items;
    }
    String parentRef = StringUtils.hasText(listedParentRef) ? listedParentRef : null;
    files.forEach(node -> items.add(mapListedItem(node, parentRef)));
    return items;
  }

  private CloudItem mapListedItem(JsonNode node, String parentRef) {
    CloudItem mapped = mapFile(node, null);
    if (mapped.parentKnown()) {
      return mapped;
    }
    return new CloudItem(
        mapped.ref(),
        mapped.provider(),
        mapped.name(),
        mapped.kind(),
        mapped.mimeType(),
        mapped.extension(),
        mapped.size(),
        mapped.modifiedAt(),
        parentRef,
        true
    );
  }

  private CloudItem mapCreated(JsonNode node, String parentRef) {
    CloudItem mapped = mapFile(node, null);
    String parent = StringUtils.hasText(parentRef) ? parentRef : null;
    return new CloudItem(
        mapped.ref(),
        mapped.provider(),
        mapped.name(),
        mapped.kind(),
        mapped.mimeType(),
        mapped.extension(),
        mapped.size(),
        mapped.modifiedAt(),
        parent,
        true
    );
  }

  private CloudItem mapFile(JsonNode node, String rootId) {
    String mime = node.path("mimeType").asText(null);
    boolean folder = "application/vnd.google-apps.folder".equals(mime);
    String name = node.path("name").asText(null);
    Long size = folder ? null : parseSize(node.path("size"));
    String parentId = firstParent(node);
    if (!StringUtils.hasText(parentId)) {
      return new CloudItem(
          node.path("id").asText(),
          CloudProvider.GOOGLE_DRIVE.id(),
          name,
          folder ? ItemKind.FOLDER : ItemKind.FILE,
          mime,
          CloudItemSupport.extensionFromName(name),
          size,
          parseModified(node.path("modifiedTime").asText(null)),
          null,
          false
      );
    }
    if (rootId != null && rootId.equals(parentId)) {
      parentId = null;
    }

    return new CloudItem(
        node.path("id").asText(),
        CloudProvider.GOOGLE_DRIVE.id(),
        name,
        folder ? ItemKind.FOLDER : ItemKind.FILE,
        mime,
        CloudItemSupport.extensionFromName(name),
        size,
        parseModified(node.path("modifiedTime").asText(null)),
        parentId,
        rootId != null
    );
  }

  private static CloudItem mapUnknownParent(JsonNode node) {
    String mime = node.path("mimeType").asText(null);
    boolean folder = "application/vnd.google-apps.folder".equals(mime);
    String name = node.path("name").asText(null);
    Long size = folder ? null : parseSize(node.path("size"));

    return new CloudItem(
        node.path("id").asText(),
        CloudProvider.GOOGLE_DRIVE.id(),
        name,
        folder ? ItemKind.FOLDER : ItemKind.FILE,
        mime,
        CloudItemSupport.extensionFromName(name),
        size,
        parseModified(node.path("modifiedTime").asText(null)),
        null,
        false
    );
  }

  private static Long parseSize(JsonNode sizeNode) {
    if (sizeNode.isMissingNode() || sizeNode.isNull()) {
      return null;
    }
    return sizeNode.asLong();
  }

  private static OffsetDateTime parseModified(String value) {
    if (!StringUtils.hasText(value)) {
      return null;
    }
    return OffsetDateTime.parse(value).withOffsetSameInstant(ZoneOffset.UTC);
  }

  private static ExportTarget officeExportTarget(String mimeType, String name) {
    return switch (mimeType) {
      case "application/vnd.google-apps.spreadsheet" -> new ExportTarget(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          replaceExtension(name, "xlsx")
      );
      case "application/vnd.google-apps.presentation" -> new ExportTarget(
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          replaceExtension(name, "pptx")
      );
      case "application/vnd.google-apps.drawing" -> new ExportTarget("image/png", replaceExtension(name, "png"));
      default -> new ExportTarget(
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          replaceExtension(name, "docx")
      );
    };
  }

  private static String replaceExtension(String name, String ext) {
    if (name == null || name.isBlank()) {
      return "file." + ext;
    }
    int dot = name.lastIndexOf('.');
    if (dot < 0) {
      return name + "." + ext;
    }
    return name.substring(0, dot + 1) + ext;
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
      ProviderHttpSupport.throwOnError(status, headers, body, CloudProvider.GOOGLE_DRIVE);
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

  private static String escapeQuery(String value) {
    return value.replace("\\", "\\\\").replace("'", "\\'");
  }

  static String urlEncode(String value) {
    return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8);
  }

  private static String bearer(String accessToken) {
    return "Bearer " + accessToken;
  }

  private static String escapeJson(String value) {
    return value.replace("\\", "\\\\").replace("\"", "\\\"");
  }

  private record ExportTarget(String mimeType, String fileName) {
  }
}
