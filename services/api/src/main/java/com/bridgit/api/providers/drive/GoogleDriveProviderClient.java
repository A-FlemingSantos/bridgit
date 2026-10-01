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
import com.bridgit.api.providers.sync.CloudChange;
import com.bridgit.api.providers.sync.CloudSyncClient;
import com.bridgit.api.providers.sync.CloudWatchClient;
import com.bridgit.api.providers.sync.PreparedWrite;
import com.bridgit.api.providers.sync.SyncPage;
import com.bridgit.api.providers.sync.SyncResetException;
import com.bridgit.api.providers.sync.WatchRegistration;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
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
public class GoogleDriveProviderClient implements CloudProviderClient, CloudSyncClient, CloudWatchClient {

  private static final String DRIVE_BASE = "https://www.googleapis.com/drive/v3";
  private static final String UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
  private static final String FILE_FIELDS =
      "id,name,mimeType,size,modifiedTime,parents,version,headRevisionId,md5Checksum,sha1Checksum,sha256Checksum,trashed";
  static final String LIST_FIELDS = "nextPageToken,incompleteSearch,files(" + FILE_FIELDS + ")";
  static final String ITEM_FIELDS = FILE_FIELDS;
  private static final String CHANGE_FIELDS =
      "nextPageToken,newStartPageToken,changes(fileId,removed,file(" + FILE_FIELDS + "))";
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
  public SyncPage syncPage(String accessToken, String checkpoint) {
    SyncCheckpoint state = StringUtils.hasText(checkpoint) ? decodeCheckpoint(checkpoint) : null;
    if (state == null) {
      String rootRef = fetchRootId(accessToken);
      String startPageToken = fetchStartPageToken(accessToken);
      return inventoryPage(accessToken, new SyncCheckpoint("inventory", rootRef, startPageToken, null));
    }
    if ("inventory".equals(state.phase())) {
      return inventoryPage(accessToken, state);
    }
    if ("changes".equals(state.phase())) {
      return changesPage(accessToken, state);
    }
    throw new SyncResetException("Checkpoint do Google Drive invalido.");
  }

  @Override
  public PreparedWrite prepareCreate(String accessToken) {
    JsonNode json = authorizedPostJson(accessToken,
        DRIVE_BASE + "/files/generateIds?count=1&space=drive&fields=ids", "{}");
    String id = json.path("ids").path(0).asText(null);
    if (!StringUtils.hasText(id)) {
      throw new ProviderApiException("Nao foi possivel reservar o identificador do arquivo.");
    }
    return new PreparedWrite(id, null);
  }

  @Override
  public CloudItem createFolderPrepared(String accessToken, String parentRef, String name,
      PreparedWrite prepared) {
    String parent = resolveParent(accessToken, parentRef);
    String id = prepared == null ? null : prepared.remoteRef();
    String body = """
        {%s"name":"%s","mimeType":"application/vnd.google-apps.folder","parents":["%s"]}
        """.formatted(idProperty(id), escapeJson(name), escapeJson(parent));
    JsonNode json = authorizedPostJson(accessToken,
        DRIVE_BASE + "/files?fields=" + urlEncode(ITEM_FIELDS) + "&supportsAllDrives=true", body);
    return mapCreated(json, parentRef);
  }

  @Override
  public CloudItem uploadPrepared(String accessToken, String parentRef, String name,
      String contentType, long size, InputStreamSource content, PreparedWrite prepared) {
    String parent = resolveParent(accessToken, parentRef);
    String id = prepared == null ? null : prepared.remoteRef();
    if (size <= MULTIPART_MAX) {
      return multipartUpload(accessToken, parent, parentRef, name, contentType, size, content, id);
    }
    return resumableUpload(accessToken, parent, parentRef, name, contentType, size, content, id);
  }

  @Override
  public WatchRegistration watch(String accessToken, String callbackUrl, String clientState,
      WatchRegistration previous) {
    String channelId = UUID.randomUUID().toString();
    String pageToken = fetchStartPageToken(accessToken);
    String body = """
        {"id":"%s","type":"web_hook","address":"%s","token":%s}
        """.formatted(escapeJson(channelId), escapeJson(callbackUrl), jsonValue(clientState));
    JsonNode response = authorizedPostJson(accessToken,
        DRIVE_BASE + "/changes/watch?pageToken=" + urlEncode(pageToken)
            + "&supportsAllDrives=true&restrictToMyDrive=false",
        body);
    WatchRegistration current = new WatchRegistration(channelId,
        response.path("resourceId").asText(null), parseExpiration(response.path("expiration").asText(null)));
    if (!StringUtils.hasText(current.resourceId())) {
      throw new ProviderApiException("Nao foi possivel criar a inscricao do Google Drive.");
    }
    if (previous != null && StringUtils.hasText(previous.id()) && StringUtils.hasText(previous.resourceId())) {
      authorizedPostJson(accessToken, DRIVE_BASE + "/channels/stop", """
          {"id":"%s","resourceId":"%s"}
          """.formatted(escapeJson(previous.id()), escapeJson(previous.resourceId())));
    }
    return current;
  }

  private SyncPage inventoryPage(String accessToken, SyncCheckpoint state) {
    String url = DRIVE_BASE + "/files?q=" + urlEncode("trashed=false")
        + "&corpora=user&fields=" + urlEncode(LIST_FIELDS)
        + "&pageSize=" + PAGE_SIZE + "&orderBy=folder,name&supportsAllDrives=true";
    if (StringUtils.hasText(state.pageToken())) {
      url += "&pageToken=" + urlEncode(state.pageToken());
    }
    JsonNode json = authorizedSyncGet(accessToken, url);
    if (json.path("incompleteSearch").asBoolean(false)) {
      throw new SyncResetException("O inventario do Google Drive ficou incompleto.");
    }
    List<CloudChange> changes = new ArrayList<>();
    JsonNode files = json.path("files");
    if (files.isArray()) {
      files.forEach(file -> changes.add(changeForFile(file, state.rootRef())));
    }
    String next = json.path("nextPageToken").asText(null);
    if (StringUtils.hasText(next)) {
      return new SyncPage(changes, encodeCheckpoint(new SyncCheckpoint(
          "inventory", state.rootRef(), state.startPageToken(), next)), false, state.rootRef());
    }
    return new SyncPage(changes, encodeCheckpoint(new SyncCheckpoint(
        "changes", state.rootRef(), null, state.startPageToken())), false, state.rootRef());
  }

  private SyncPage changesPage(String accessToken, SyncCheckpoint state) {
    if (!StringUtils.hasText(state.pageToken())) {
      throw new SyncResetException("Checkpoint do Google Drive sem token de alteracoes.");
    }
    String url = DRIVE_BASE + "/changes?pageToken=" + urlEncode(state.pageToken())
        + "&fields=" + urlEncode(CHANGE_FIELDS) + "&pageSize=" + PAGE_SIZE
        + "&includeRemoved=true&restrictToMyDrive=false&supportsAllDrives=true";
    JsonNode json = authorizedSyncGet(accessToken, url);
    List<CloudChange> changes = new ArrayList<>();
    JsonNode entries = json.path("changes");
    if (entries.isArray()) {
      entries.forEach(change -> changes.add(mapChange(change, state.rootRef())));
    }
    String next = json.path("nextPageToken").asText(null);
    if (StringUtils.hasText(next)) {
      return new SyncPage(changes, encodeCheckpoint(new SyncCheckpoint(
          "changes", state.rootRef(), null, next)), false, state.rootRef());
    }
    String start = json.path("newStartPageToken").asText(null);
    if (!StringUtils.hasText(start)) {
      throw new SyncResetException("Resposta do Google Drive sem token de continuidade.");
    }
    return new SyncPage(changes, encodeCheckpoint(new SyncCheckpoint(
        "changes", state.rootRef(), null, start)), true, state.rootRef());
  }

  private String fetchStartPageToken(String accessToken) {
    JsonNode json = authorizedGet(accessToken,
        DRIVE_BASE + "/changes/startPageToken?fields=startPageToken&supportsAllDrives=true");
    String token = json.path("startPageToken").asText(null);
    if (!StringUtils.hasText(token)) {
      throw new ProviderApiException("Nao foi possivel iniciar a sincronizacao do Google Drive.");
    }
    return token;
  }

  private CloudChange mapChange(JsonNode change, String rootRef) {
    String ref = change.path("fileId").asText(null);
    JsonNode file = change.path("file");
    if (change.path("removed").asBoolean(false) || file.path("trashed").asBoolean(false)) {
      return CloudChange.removed(ref);
    }
    if (!file.isObject()) {
      return new CloudChange(ref, null, false, null, null, Set.of());
    }
    return new CloudChange(ref, mapFile(file, rootRef), false, null, null, knownFields(file));
  }

  private CloudChange changeForFile(JsonNode file, String rootRef) {
    return new CloudChange(file.path("id").asText(), mapFile(file, rootRef), false, null, null,
        knownFields(file));
  }

  private static Set<String> knownFields(JsonNode file) {
    Set<String> fields = new LinkedHashSet<>();
    if (file.has("name")) {
      fields.add("name");
      fields.add("extension");
    }
    if (file.has("mimeType")) {
      fields.add("kind");
      fields.add("mimeType");
      if ("application/vnd.google-apps.folder".equals(file.path("mimeType").asText())) {
        fields.add("size");
      }
    }
    if (file.has("size")) {
      fields.add("size");
    }
    if (file.has("modifiedTime")) {
      fields.add("modifiedAt");
    }
    if (file.has("parents")) {
      fields.add("parentRef");
    }
    if (file.has("version")) {
      fields.add("remoteVersion");
    }
    if (file.has("headRevisionId") || file.has("md5Checksum") || file.has("sha1Checksum")
        || file.has("sha256Checksum")) {
      fields.add("contentRevision");
    }
    return fields;
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
    return createFolderPrepared(accessToken, parentRef, name, new PreparedWrite(null, null));
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
    return uploadPrepared(accessToken, parentRef, name, contentType, size, content,
        new PreparedWrite(null, null));
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
      InputStreamSource content,
      String remoteRef
  ) {
    String metadata = """
        {%s"name":"%s","parents":["%s"]}
        """.formatted(idProperty(remoteRef), escapeJson(name), escapeJson(parent));
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
      InputStreamSource content,
      String remoteRef
  ) {
    String metadata = """
        {%s"name":"%s","parents":["%s"]}
        """.formatted(idProperty(remoteRef), escapeJson(name), escapeJson(parent));

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

  private JsonNode authorizedSyncGet(String accessToken, String url) {
    return restClient.get()
        .uri(URI.create(url))
        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
        .exchange((request, response) -> {
          try {
            if (response.getStatusCode().value() == 410) {
              response.close();
              throw new SyncResetException("O token de alteracoes do Google Drive expirou.");
            }
          } catch (SyncResetException ex) {
            throw ex;
          } catch (Exception ex) {
            throw new ProviderApiException("Nao foi possivel sincronizar o Google Drive.");
          }
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
        true,
        mapped.remoteVersion(),
        mapped.contentRevision()
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
        true,
        mapped.remoteVersion(),
        mapped.contentRevision()
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
          false,
          remoteVersion(node),
          contentRevision(node)
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
        rootId != null,
        remoteVersion(node),
        contentRevision(node)
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
        false,
        remoteVersion(node),
        contentRevision(node)
    );
  }

  private static Long parseSize(JsonNode sizeNode) {
    if (sizeNode.isMissingNode() || sizeNode.isNull()) {
      return null;
    }
    return sizeNode.asLong();
  }

  private static String remoteVersion(JsonNode node) {
    return node.path("version").asText(null);
  }

  private static String contentRevision(JsonNode node) {
    for (String field : List.of("headRevisionId", "sha256Checksum", "sha1Checksum", "md5Checksum")) {
      String value = node.path(field).asText(null);
      if (StringUtils.hasText(value)) {
        return value;
      }
    }
    return null;
  }

  private static OffsetDateTime parseModified(String value) {
    if (!StringUtils.hasText(value)) {
      return null;
    }
    return OffsetDateTime.parse(value).withOffsetSameInstant(ZoneOffset.UTC);
  }

  private String encodeCheckpoint(SyncCheckpoint checkpoint) {
    try {
      return Base64.getUrlEncoder().withoutPadding().encodeToString(
          objectMapper.writeValueAsBytes(checkpoint));
    } catch (Exception ex) {
      throw new ProviderApiException("Nao foi possivel salvar o checkpoint do Google Drive.");
    }
  }

  private SyncCheckpoint decodeCheckpoint(String checkpoint) {
    try {
      JsonNode node = objectMapper.readTree(Base64.getUrlDecoder().decode(checkpoint));
      String phase = node.path("phase").asText(null);
      String rootRef = node.path("rootRef").asText(null);
      String startPageToken = node.path("startPageToken").asText(null);
      String pageToken = node.path("pageToken").asText(null);
      if (!StringUtils.hasText(phase) || !StringUtils.hasText(rootRef)) {
        throw new IllegalArgumentException();
      }
      return new SyncCheckpoint(phase, rootRef, startPageToken, pageToken);
    } catch (Exception ex) {
      throw new SyncResetException("Checkpoint do Google Drive invalido.");
    }
  }

  private static Instant parseExpiration(String value) {
    if (!StringUtils.hasText(value)) {
      return null;
    }
    try {
      return Instant.ofEpochMilli(Long.parseLong(value));
    } catch (NumberFormatException ex) {
      throw new ProviderApiException("Expiracao da inscricao do Google Drive invalida.");
    }
  }

  private static String idProperty(String remoteRef) {
    return StringUtils.hasText(remoteRef) ? "\"id\":\"" + escapeJson(remoteRef) + "\",": "";
  }

  private static String jsonValue(String value) {
    return StringUtils.hasText(value) ? "\"" + escapeJson(value) + "\"" : "null";
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

  private record SyncCheckpoint(String phase, String rootRef, String startPageToken, String pageToken) {
  }
}
