package com.bridgit.api.providers.drive;

import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudItemSupport;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClient;
import com.bridgit.api.providers.ContentStream;
import com.bridgit.api.providers.ContentVariant;
import com.bridgit.api.providers.CursorCodec;
import com.bridgit.api.providers.ItemKind;
import com.bridgit.api.providers.ItemPage;
import com.bridgit.api.providers.ProviderApiException;
import com.bridgit.api.providers.ProviderHttpSupport;
import com.bridgit.api.providers.ReadPlan;
import com.bridgit.api.providers.ReadPlanSupport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

@Component
public class GoogleDriveProviderClient implements CloudProviderClient {

  private static final String DRIVE_BASE = "https://www.googleapis.com/drive/v3";
  private static final String UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
  private static final String FIELDS =
      "nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)";
  private static final String FILE_FIELDS = "id,name,mimeType,size,modifiedTime,parents";
  private static final int PAGE_SIZE = 200;
  private static final long MULTIPART_MAX = 5L * 1024L * 1024L;

  private final RestClient restClient;
  private final ObjectMapper objectMapper;

  public GoogleDriveProviderClient(RestClient.Builder restClientBuilder, ObjectMapper objectMapper) {
    this.restClient = restClientBuilder.build();
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
        + "&fields=" + urlEncode(FIELDS)
        + "&pageSize=" + PAGE_SIZE
        + "&orderBy=folder,name"
        + "&supportsAllDrives=true";

    if (StringUtils.hasText(cursor)) {
      url += "&pageToken=" + urlEncode(CursorCodec.decode(cursor));
    }

    JsonNode json = authorizedGet(accessToken, url);
    List<CloudItem> items = mapFiles(json.path("files"));
    String nextPageToken = json.path("nextPageToken").asText(null);
    return new ItemPage(CloudItemSupport.sortItems(items), CursorCodec.encode(nextPageToken));
  }

  @Override
  public CloudItem get(String accessToken, String ref) {
    JsonNode json = authorizedGet(
        accessToken,
        DRIVE_BASE + "/files/" + ref + "?fields=" + urlEncode(FILE_FIELDS) + "&supportsAllDrives=true"
    );
    return mapFile(json);
  }

  @Override
  public List<CloudItem> ancestry(String accessToken, String ref) {
    List<CloudItem> path = new ArrayList<>();
    String rootId = fetchRootId(accessToken);
    String current = ref;

    while (StringUtils.hasText(current) && !rootId.equals(current)) {
      JsonNode item = authorizedGet(
          accessToken,
          DRIVE_BASE + "/files/" + current + "?fields=" + urlEncode("id,name,parents") + "&supportsAllDrives=true"
      );
      JsonNode parents = item.path("parents");
      if (!parents.isArray() || parents.isEmpty()) {
        break;
      }
      String parentId = parents.get(0).asText();
      path.add(new CloudItem(
          item.path("id").asText(),
          CloudProvider.GOOGLE_DRIVE.id(),
          item.path("name").asText(),
          ItemKind.FOLDER,
          "application/vnd.google-apps.folder",
          null,
          null,
          null,
          parentId
      ));
      if (rootId.equals(parentId)) {
        break;
      }
      current = parentId;
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
        DRIVE_BASE + "/files?fields=" + urlEncode(FILE_FIELDS) + "&supportsAllDrives=true",
        body
    );
    return mapFile(json);
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
    String parent = resolveParent(accessToken, parentRef);
    if (size <= MULTIPART_MAX) {
      return multipartUpload(accessToken, parent, name, contentType, content);
    }
    return resumableUpload(accessToken, parent, name, contentType, size, content);
  }

  @Override
  public CloudItem update(String accessToken, String ref, String newName, String newParentRef) {
    String url = DRIVE_BASE + "/files/" + ref + "?fields=" + urlEncode(FILE_FIELDS) + "&supportsAllDrives=true";
    if (newParentRef != null) {
      CloudItem current = get(accessToken, ref);
      String targetParent = newParentRef.isBlank() ? fetchRootId(accessToken) : newParentRef;
      String removeParents = current.parentRef() == null ? "" : current.parentRef();
      url += "&addParents=" + urlEncode(targetParent);
      if (StringUtils.hasText(removeParents)) {
        url += "&removeParents=" + urlEncode(removeParents);
      }
    }

    String body = newName == null ? "{}" : "{\"name\":\"" + escapeJson(newName) + "\"}";
    JsonNode json = authorizedPatchJson(accessToken, url, body);
    return mapFile(json);
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
      return exportStream(accessToken, item.ref(), "application/pdf", item.name(), "application/pdf");
    }

    if (ReadPlanSupport.isGoogleNative(item.mimeType())) {
      ExportTarget target = officeExportTarget(item.mimeType(), item.name());
      return exportStream(accessToken, item.ref(), target.mimeType(), target.fileName(), target.mimeType());
    }

    return mediaStream(accessToken, item.ref(), item.name(), item.mimeType());
  }

  @Override
  public List<CloudItem> search(String accessToken, String query, int limit) {
    String q = "name contains '" + escapeQuery(query) + "' and trashed=false";
    String url = DRIVE_BASE + "/files?q=" + urlEncode(q)
        + "&fields=" + urlEncode(FILE_FIELDS)
        + "&pageSize=" + Math.min(limit, PAGE_SIZE)
        + "&supportsAllDrives=true";
    JsonNode json = authorizedGet(accessToken, url);
    return mapFiles(json.path("files")).stream().limit(limit).toList();
  }

  private CloudItem multipartUpload(
      String accessToken,
      String parent,
      String name,
      String contentType,
      InputStream content
  ) {
    String metadata = """
        {"name":"%s","parents":["%s"]}
        """.formatted(escapeJson(name), escapeJson(parent));
    String boundary = "bridgit-" + System.nanoTime();
    MediaType mediaType = StringUtils.hasText(contentType)
        ? MediaType.parseMediaType(contentType)
        : MediaType.APPLICATION_OCTET_STREAM;

    byte[] body = buildMultipart(boundary, metadata, mediaType.toString(), content);

    JsonNode json = restClient.post()
        .uri(URI.create(UPLOAD_BASE + "/files?uploadType=multipart&fields=" + urlEncode(FILE_FIELDS)))
        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
        .contentType(MediaType.parseMediaType("multipart/related; boundary=" + boundary))
        .body(body)
        .exchange((request, response) -> {
          ensureSuccess(response);
          try {
            return objectMapper.readTree(response.getBody());
          } catch (Exception ex) {
            throw new ProviderApiException("Nao foi possivel enviar o arquivo.");
          }
        });
    return mapFile(json);
  }

  private CloudItem resumableUpload(
      String accessToken,
      String parent,
      String name,
      String contentType,
      long size,
      InputStream content
  ) {
    String metadata = """
        {"name":"%s","parents":["%s"]}
        """.formatted(escapeJson(name), escapeJson(parent));

    String uploadUrl = restClient.post()
        .uri(URI.create(UPLOAD_BASE + "/files?uploadType=resumable&fields=" + urlEncode(FILE_FIELDS)))
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

    JsonNode json = restClient.put()
        .uri(URI.create(uploadUrl))
        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
        .header(HttpHeaders.CONTENT_LENGTH, String.valueOf(size))
        .contentType(StringUtils.hasText(contentType)
            ? MediaType.parseMediaType(contentType)
            : MediaType.APPLICATION_OCTET_STREAM)
        .body(content)
        .exchange((request, response) -> {
          ensureSuccess(response);
          try {
            return objectMapper.readTree(response.getBody());
          } catch (Exception ex) {
            throw new ProviderApiException("Nao foi possivel concluir o envio do arquivo.");
          }
        });
    return mapFile(json);
  }

  private ContentStream exportStream(
      String accessToken,
      String ref,
      String exportMime,
      String fileName,
      String contentType
  ) {
    String url = DRIVE_BASE + "/files/" + ref + "/export?mimeType=" + urlEncode(exportMime);
    ClientHttpResponse response = restClient.get()
        .uri(URI.create(url))
        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
        .exchange((request, resp) -> {
          ensureSuccess(resp);
          return resp;
        }, false);
    return toContentStream(response, fileName, contentType);
  }

  private ContentStream mediaStream(String accessToken, String ref, String fileName, String contentType) {
    String url = DRIVE_BASE + "/files/" + ref + "?alt=media&supportsAllDrives=true";
    ClientHttpResponse response = restClient.get()
        .uri(URI.create(url))
        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
        .exchange((request, resp) -> {
          ensureSuccess(resp);
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

  private List<CloudItem> mapFiles(JsonNode files) {
    List<CloudItem> items = new ArrayList<>();
    if (!files.isArray()) {
      return items;
    }
    files.forEach(node -> items.add(mapFile(node)));
    return items;
  }

  private CloudItem mapFile(JsonNode node) {
    String mime = node.path("mimeType").asText(null);
    boolean folder = "application/vnd.google-apps.folder".equals(mime);
    String name = node.path("name").asText(null);
    Long size = folder ? null : parseSize(node.path("size"));
    String parentRef = null;
    JsonNode parents = node.path("parents");
    if (parents.isArray() && !parents.isEmpty()) {
      parentRef = parents.get(0).asText();
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
        parentRef
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

  private static byte[] buildMultipart(String boundary, String metadata, String contentType, InputStream content) {
    try {
      String preamble = "--" + boundary + "\r\n"
          + "Content-Type: application/json; charset=UTF-8\r\n\r\n"
          + metadata + "\r\n"
          + "--" + boundary + "\r\n"
          + "Content-Type: " + contentType + "\r\n\r\n";
      byte[] head = preamble.getBytes(StandardCharsets.UTF_8);
      byte[] fileBytes = content.readAllBytes();
      byte[] tail = ("\r\n--" + boundary + "--").getBytes(StandardCharsets.UTF_8);
      byte[] all = new byte[head.length + fileBytes.length + tail.length];
      System.arraycopy(head, 0, all, 0, head.length);
      System.arraycopy(fileBytes, 0, all, head.length, fileBytes.length);
      System.arraycopy(tail, 0, all, head.length + fileBytes.length, tail.length);
      return all;
    } catch (Exception ex) {
      throw new ProviderApiException("Nao foi possivel enviar o arquivo.");
    }
  }

  private static ContentStream toContentStream(ClientHttpResponse response, String fileName, String contentType) {
    try {
      Long length = response.getHeaders().getContentLength();
      InputStream body = response.getBody();
      return new ContentStream(body, contentType, length >= 0 ? length : null, fileName);
    } catch (Exception ex) {
      throw new ProviderApiException("Nao foi possivel abrir o conteudo.");
    }
  }

  private static void ensureSuccess(ClientHttpResponse response) {
    try {
      HttpStatusCode status = response.getStatusCode();
      if (!status.isError()) {
        return;
      }
      String body = readBody(response);
      response.close();
      ProviderHttpSupport.throwOnError(status, body);
    } catch (ProviderApiException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new ProviderApiException("Nao foi possivel concluir a operacao.");
    }
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

  private static String urlEncode(String value) {
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
