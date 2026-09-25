package com.bridgit.api.providers.graph;

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
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriUtils;

@Component
public class GraphProviderClient implements CloudProviderClient {

  private static final String DRIVE_BASE = "https://graph.microsoft.com/v1.0/me/drive";
  private static final String SELECT =
      "id,name,size,file,folder,lastModifiedDateTime,parentReference";
  private static final int PAGE_SIZE = 200;
  private static final long SIMPLE_UPLOAD_MAX = 4L * 1024L * 1024L;
  private static final int CHUNK_SIZE = 320 * 1024;

  private final RestClient restClient;
  private final RestClient noRedirectClient;
  private final ObjectMapper objectMapper;

  @Autowired
  public GraphProviderClient(RestClient.Builder restClientBuilder, ObjectMapper objectMapper) {
    this(
        restClientBuilder.build(),
        RestClient.builder()
            .requestFactory(NoRedirectClientHttpRequestFactory.create())
            .build(),
        objectMapper
    );
  }

  GraphProviderClient(RestClient restClient, RestClient noRedirectClient, ObjectMapper objectMapper) {
    this.restClient = restClient;
    this.noRedirectClient = noRedirectClient;
    this.objectMapper = objectMapper;
  }

  @Override
  public CloudProvider provider() {
    return CloudProvider.ONEDRIVE;
  }

  @Override
  public ItemPage list(String accessToken, String parentRef, String cursor) {
    String url;
    if (StringUtils.hasText(cursor)) {
      url = CursorCodec.decode(cursor);
    } else if (!StringUtils.hasText(parentRef)) {
      url = DRIVE_BASE + "/root/children?$select=" + SELECT + "&$top=" + PAGE_SIZE;
    } else {
      url = DRIVE_BASE + "/items/" + parentRef + "/children?$select=" + SELECT + "&$top=" + PAGE_SIZE;
    }

    JsonNode json = authorizedGet(accessToken, url);
    List<CloudItem> items = mapChildren(json.path("value"));
    String nextLink = json.path("@odata.nextLink").asText(null);
    return new ItemPage(CloudItemSupport.sortItems(items), CursorCodec.encode(nextLink));
  }

  @Override
  public CloudItem get(String accessToken, String ref) {
    JsonNode json = authorizedGet(accessToken, DRIVE_BASE + "/items/" + ref + "?$select=" + SELECT);
    return mapItem(json);
  }

  @Override
  public List<CloudItem> ancestry(String accessToken, String ref) {
    List<CloudItem> path = new ArrayList<>();
    String rootId = fetchRootId(accessToken);
    JsonNode item = authorizedGet(
        accessToken,
        DRIVE_BASE + "/items/" + ref + "?$select=id,name,parentReference"
    );
    String parentId = item.path("parentReference").path("id").asText(null);

    while (StringUtils.hasText(parentId) && !rootId.equals(parentId)) {
      JsonNode parent = authorizedGet(
          accessToken,
          DRIVE_BASE + "/items/" + parentId + "?$select=id,name,parentReference"
      );
      path.add(new CloudItem(
          parent.path("id").asText(),
          CloudProvider.ONEDRIVE.id(),
          parent.path("name").asText(),
          ItemKind.FOLDER,
          null,
          null,
          null,
          null,
          parent.path("parentReference").path("id").asText(null)
      ));
      parentId = parent.path("parentReference").path("id").asText(null);
      if (rootId.equals(parent.path("id").asText())) {
        break;
      }
    }

    Collections.reverse(path);
    return path;
  }

  @Override
  public CloudItem createFolder(String accessToken, String parentRef, String name) {
    String parent = StringUtils.hasText(parentRef) ? parentRef : "root";
    String body = """
        {"name":"%s","folder":{},"@microsoft.graph.conflictBehavior":"rename"}
        """.formatted(escapeJson(name));

    JsonNode json = authorizedPost(
        accessToken,
        DRIVE_BASE + "/items/" + parent + "/children",
        body,
        MediaType.APPLICATION_JSON
    );
    return mapItem(json);
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
    if (size <= SIMPLE_UPLOAD_MAX) {
      return simpleUpload(accessToken, parentRef, name, contentType, content);
    }
    return sessionUpload(accessToken, parentRef, name, contentType, size, content);
  }

  @Override
  public CloudItem update(String accessToken, String ref, String newName, String newParentRef) {
    StringBuilder body = new StringBuilder("{");
    boolean first = true;
    if (StringUtils.hasText(newName)) {
      body.append("\"name\":\"").append(escapeJson(newName)).append("\"");
      first = false;
    }
    if (newParentRef != null) {
      if (!first) {
        body.append(',');
      }
      String parentId = newParentRef.isBlank() ? fetchRootId(accessToken) : newParentRef;
      body.append("\"parentReference\":{\"id\":\"").append(escapeJson(parentId)).append("\"}");
    }
    body.append('}');

    JsonNode json = authorizedPatch(
        accessToken,
        DRIVE_BASE + "/items/" + ref,
        body.toString(),
        MediaType.APPLICATION_JSON
    );
    return mapItem(json);
  }

  @Override
  public void delete(String accessToken, String ref) {
    authorizedDelete(accessToken, DRIVE_BASE + "/items/" + ref);
  }

  @Override
  public ReadPlan readPlan(CloudItem item) {
    return ReadPlanSupport.readPlan(CloudProvider.ONEDRIVE, item);
  }

  @Override
  public ContentStream open(String accessToken, CloudItem item, ContentVariant variant) {
    String url = DRIVE_BASE + "/items/" + item.ref() + "/content";
    if (variant == ContentVariant.READ) {
      url += "?format=pdf";
    }
    return followRedirectStream(accessToken, url, item.name(), contentTypeFor(item, variant));
  }

  @Override
  public List<CloudItem> search(String accessToken, String query, int limit) {
    String escaped = query.replace("'", "''");
    String url = DRIVE_BASE + "/root/search(q='" + UriUtils.encodePathSegment(escaped, StandardCharsets.UTF_8) + "')"
        + "?$select=" + SELECT + "&$top=" + Math.min(limit, PAGE_SIZE);
    JsonNode json = authorizedGet(accessToken, url);
    return mapChildren(json.path("value")).stream().limit(limit).toList();
  }

  private CloudItem simpleUpload(
      String accessToken,
      String parentRef,
      String name,
      String contentType,
      InputStream content
  ) {
    String parent = StringUtils.hasText(parentRef) ? parentRef : "root";
    String encodedName = UriUtils.encodePathSegment(name, StandardCharsets.UTF_8);
    String url = DRIVE_BASE + "/items/" + parent + ":/" + encodedName + ":/content";
    MediaType mediaType = StringUtils.hasText(contentType)
        ? MediaType.parseMediaType(contentType)
        : MediaType.APPLICATION_OCTET_STREAM;

    JsonNode json = restClient.put()
        .uri(URI.create(url))
        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
        .contentType(mediaType)
        .body(content)
        .exchange((request, response) -> {
          ensureSuccess(response);
          try {
            return objectMapper.readTree(response.getBody());
          } catch (Exception ex) {
            throw new ProviderApiException("Nao foi possivel enviar o arquivo.");
          }
        });
    return mapItem(json);
  }

  private CloudItem sessionUpload(
      String accessToken,
      String parentRef,
      String name,
      String contentType,
      long size,
      InputStream content
  ) {
    String parent = StringUtils.hasText(parentRef) ? parentRef : "root";
    String body = """
        {"item":{"@microsoft.graph.conflictBehavior":"rename","name":"%s"},"@microsoft.graph.conflictBehavior":"rename"}
        """.formatted(escapeJson(name));

    JsonNode session = authorizedPost(
        accessToken,
        DRIVE_BASE + "/items/" + parent + ":/" + UriUtils.encodePathSegment(name, StandardCharsets.UTF_8) + ":/createUploadSession",
        body,
        MediaType.APPLICATION_JSON
    );
    String uploadUrl = session.path("uploadUrl").asText(null);
    if (!StringUtils.hasText(uploadUrl)) {
      throw new ProviderApiException("Nao foi possivel iniciar o envio do arquivo.");
    }

    byte[] buffer = new byte[CHUNK_SIZE];
    long uploaded = 0;
    JsonNode lastResponse = null;

    try {
      while (uploaded < size) {
        int toRead = (int) Math.min(CHUNK_SIZE, size - uploaded);
        int read = content.read(buffer, 0, toRead);
        if (read <= 0) {
          break;
        }
        long start = uploaded;
        long end = uploaded + read - 1;
        uploaded += read;

        byte[] chunk = read == buffer.length ? buffer : java.util.Arrays.copyOf(buffer, read);
        lastResponse = restClient.put()
            .uri(URI.create(uploadUrl))
            .header("Content-Length", String.valueOf(read))
            .header("Content-Range", "bytes " + start + "-" + end + "/" + size)
            .contentType(MediaType.APPLICATION_OCTET_STREAM)
            .body(chunk)
            .exchange((request, response) -> {
              if (response.getStatusCode().is2xxSuccessful() || response.getStatusCode().value() == 202) {
                if (response.getStatusCode().value() == 202) {
                  return null;
                }
                try {
                  return objectMapper.readTree(response.getBody());
                } catch (Exception ex) {
                  throw new ProviderApiException("Nao foi possivel concluir o envio do arquivo.");
                }
              }
              ensureSuccess(response);
              return null;
            });
      }
    } catch (ProviderApiException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new ProviderApiException("Nao foi possivel enviar o arquivo.");
    }

    if (lastResponse == null) {
      throw new ProviderApiException("Nao foi possivel concluir o envio do arquivo.");
    }
    return mapItem(lastResponse);
  }

  private ContentStream followRedirectStream(
      String accessToken,
      String url,
      String fileName,
      String contentType
  ) {
    RedirectResult redirect = noRedirectClient.get()
        .uri(URI.create(url))
        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
        .exchange((request, response) -> {
          int statusCode = response.getStatusCode().value();
          if (statusCode >= 300 && statusCode < 400) {
            URI location = response.getHeaders().getLocation();
            response.close();
            return new RedirectResult(location, null);
          }
          if (statusCode >= 200 && statusCode < 300) {
            return new RedirectResult(null, response);
          }
          ensureSuccess(response);
          return null;
        }, false);

    if (redirect.location() != null) {
      ClientHttpResponse finalResponse = restClient.get()
          .uri(redirect.location())
          .exchange((request, response) -> {
            ensureSuccess(response);
            return response;
          }, false);
      return toContentStream(finalResponse, fileName, contentType);
    }
    return toContentStream(redirect.response(), fileName, contentType);
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

  private JsonNode authorizedPost(String accessToken, String url, String body, MediaType contentType) {
    return restClient.post()
        .uri(URI.create(url))
        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
        .contentType(contentType)
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

  private JsonNode authorizedPatch(String accessToken, String url, String body, MediaType contentType) {
    return restClient.patch()
        .uri(URI.create(url))
        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
        .contentType(contentType)
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

  private void authorizedDelete(String accessToken, String url) {
    restClient.delete()
        .uri(URI.create(url))
        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
        .exchange((request, response) -> {
          if (response.getStatusCode().value() == 204 || response.getStatusCode().is2xxSuccessful()) {
            response.close();
            return null;
          }
          ensureSuccess(response);
          return null;
        });
  }

  private String fetchRootId(String accessToken) {
    JsonNode json = authorizedGet(accessToken, DRIVE_BASE + "/root?$select=id");
    return json.path("id").asText();
  }

  private List<CloudItem> mapChildren(JsonNode value) {
    List<CloudItem> items = new ArrayList<>();
    if (!value.isArray()) {
      return items;
    }
    value.forEach(node -> items.add(mapItem(node)));
    return items;
  }

  private CloudItem mapItem(JsonNode node) {
    boolean folder = node.has("folder");
    String mime = folder ? null : node.path("file").path("mimeType").asText(null);
    String name = node.path("name").asText(null);
    Long size = folder ? null : node.path("size").asLong(0);
    if (!folder && size == 0 && node.path("size").isMissingNode()) {
      size = null;
    }
    OffsetDateTime modified = parseDateTime(node.path("lastModifiedDateTime").asText(null));
    String parentRef = node.path("parentReference").path("id").asText(null);

    return new CloudItem(
        node.path("id").asText(),
        CloudProvider.ONEDRIVE.id(),
        name,
        folder ? ItemKind.FOLDER : ItemKind.FILE,
        mime,
        CloudItemSupport.extensionFromName(name),
        size,
        modified,
        parentRef
    );
  }

  private static OffsetDateTime parseDateTime(String value) {
    if (!StringUtils.hasText(value)) {
      return null;
    }
    return OffsetDateTime.parse(value);
  }

  private static String contentTypeFor(CloudItem item, ContentVariant variant) {
    if (variant == ContentVariant.READ) {
      return "application/pdf";
    }
    return StringUtils.hasText(item.mimeType()) ? item.mimeType() : "application/octet-stream";
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

  private static String bearer(String accessToken) {
    return "Bearer " + accessToken;
  }

  private static String escapeJson(String value) {
    return value.replace("\\", "\\\\").replace("\"", "\\\"");
  }

  private record RedirectResult(URI location, ClientHttpResponse response) {
  }
}
