package com.bridgit.api.integrations;

import com.bridgit.api.providers.ProviderApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.function.IntPredicate;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

abstract class AbstractProviderOAuthClient implements ProviderOAuthClient {

  /** Largest profile photo accepted from a provider. */
  static final int MAX_AVATAR_BYTES = 1024 * 1024;

  protected final CloudProvidersProperties properties;
  protected final RestClient restClient;
  /** Fetches photos from provider CDN URLs: carries no credentials and never follows redirects. */
  protected final RestClient downloadClient;
  protected final ObjectMapper objectMapper;

  protected AbstractProviderOAuthClient(
      CloudProvidersProperties properties,
      RestClient restClient,
      ObjectMapper objectMapper
  ) {
    this(properties, restClient, objectMapper, restClient);
  }

  protected AbstractProviderOAuthClient(
      CloudProvidersProperties properties,
      RestClient restClient,
      ObjectMapper objectMapper,
      RestClient downloadClient
  ) {
    this.properties = properties;
    this.restClient = restClient;
    this.downloadClient = downloadClient;
    this.objectMapper = objectMapper;
  }

  /** A client that does not follow redirects, so a CDN URL cannot bounce the request to another host. */
  protected static RestClient noRedirectClient() {
    HttpClient httpClient = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.NEVER)
        .connectTimeout(Duration.ofSeconds(5))
        .build();
    JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
    factory.setReadTimeout(Duration.ofSeconds(10));
    return RestClient.builder().requestFactory(factory).build();
  }

  /**
   * The URL as a {@link URI} only when it is plain https (default port, no credentials) on a host
   * under one of the dot-prefixed suffixes; null otherwise. Provider-supplied URLs are untrusted.
   */
  protected static URI httpsUriOnHost(String url, String... hostSuffixes) {
    try {
      URI uri = new URI(url);
      String host = uri.getHost();
      if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null || uri.getUserInfo() != null
          || (uri.getPort() != -1 && uri.getPort() != 443)) {
        return null;
      }
      String lowerHost = host.toLowerCase(java.util.Locale.ROOT);
      for (String suffix : hostSuffixes) {
        if (lowerHost.endsWith(suffix)) {
          return uri;
        }
      }
      return null;
    } catch (java.net.URISyntaxException ex) {
      return null;
    }
  }

  /**
   * GETs an image. Empty when the provider has none: a status accepted by {@code absentStatus}, a
   * redirect, or a body over {@link #MAX_AVATAR_BYTES}. Any other failure is thrown, so the caller
   * can tell "no photo" from "could not find out".
   */
  protected Optional<AvatarImage> downloadImage(
      RestClient client,
      URI uri,
      String bearerToken,
      IntPredicate absentStatus
  ) {
    return client.get()
        .uri(uri)
        .headers(headers -> {
          if (bearerToken != null) {
            headers.setBearerAuth(bearerToken);
          }
        })
        .exchange((request, response) -> {
          HttpStatusCode status = response.getStatusCode();
          if (absentStatus.test(status.value()) || status.is3xxRedirection()) {
            return Optional.<AvatarImage>empty();
          }
          if (status.isError()) {
            throw transientFailure();
          }
          try (InputStream in = response.getBody()) {
            byte[] bytes = in.readNBytes(MAX_AVATAR_BYTES + 1);
            if (bytes.length == 0 || bytes.length > MAX_AVATAR_BYTES) {
              return Optional.<AvatarImage>empty();
            }
            MediaType contentType = response.getHeaders().getContentType();
            return Optional.of(new AvatarImage(
                bytes,
                contentType == null ? null : contentType.getType() + "/" + contentType.getSubtype()
            ));
          }
        });
  }

  protected CloudProvidersProperties.ProviderCredentials credentials() {
    return properties.forProvider(provider());
  }

  protected TokenResult postFormForToken(String tokenUrl, MultiValueMap<String, String> form) {
    String body = restClient.post()
        .uri(tokenUrl)
        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
        .body(form)
        .exchange((request, response) -> {
          HttpStatusCode status = response.getStatusCode();
          if (status.isError()) {
            String errorBody = readBody(response.getBody());
            response.close();
            throw mapTokenError(status, errorBody);
          }
          try {
            return new String(response.getBody().readAllBytes());
          } catch (Exception ex) {
            throw tokenExchangeFailure("");
          }
        });

    return parseTokenResult(body);
  }

  static RuntimeException mapTokenError(HttpStatusCode status, String body) {
    String error = extractErrorCode(body);
    if (("invalid_grant".equals(error))
        && (status.value() == 400 || status.value() == 401)) {
      return new ReconnectionRequiredException();
    }
    if ("invalid_client".equals(error) || "unauthorized_client".equals(error)) {
      return new ProviderApiException(
          HttpStatus.SERVICE_UNAVAILABLE,
          "PROVEDOR_CONFIGURACAO_INVALIDA",
          "O provedor de nuvem não está configurado corretamente."
      );
    }
    if (status.value() == 429 || status.value() >= 500) {
      return transientFailure();
    }
    if (error != null) {
      return tokenExchangeFailure(body);
    }
    return transientFailure();
  }

  private static String extractErrorCode(String body) {
    if (body == null || body.isBlank()) {
      return null;
    }
    try {
      JsonNode json = new ObjectMapper().readTree(body);
      String error = json.path("error").asText(null);
      return error == null || error.isBlank() ? null : error;
    } catch (Exception ex) {
      return null;
    }
  }

  protected TokenResult parseTokenResult(String body) {
    try {
      JsonNode json = objectMapper.readTree(body);
      if (json.hasNonNull("error")) {
        String error = json.path("error").asText();
        if ("invalid_grant".equals(error)) {
          throw new ReconnectionRequiredException();
        }
        throw tokenExchangeFailure(body);
      }

      String accessToken = requiredText(json, "access_token");
      String refreshToken = optionalText(json, "refresh_token");
      long expiresIn = json.path("expires_in").asLong(3600);
      String scope = optionalText(json, "scope");
      return new TokenResult(accessToken, refreshToken, expiresIn, scope);
    } catch (ReconnectionRequiredException ex) {
      throw ex;
    } catch (Exception ex) {
      throw tokenExchangeFailure(body);
    }
  }

  protected static String requiredText(JsonNode json, String field) {
    String value = json.path(field).asText(null);
    if (value == null || value.isBlank()) {
      throw new ProviderApiException("Resposta do provedor incompleta.");
    }
    return value;
  }

  protected static String optionalText(JsonNode json, String field) {
    String value = json.path(field).asText(null);
    return value == null || value.isBlank() ? null : value;
  }

  protected static String readBody(java.io.InputStream inputStream) {
    if (inputStream == null) {
      return "";
    }
    try {
      return new String(inputStream.readAllBytes());
    } catch (Exception ex) {
      return "";
    }
  }

  protected static ProviderApiException tokenExchangeFailure(String body) {
    return new ProviderApiException("Não foi possível concluir a autenticação com o provedor.");
  }

  private static ProviderApiException transientFailure() {
    return new ProviderApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "PROVEDOR_INDISPONIVEL",
        "O provedor de nuvem está indisponível. Tente novamente em instantes."
    );
  }

  protected static MultiValueMap<String, String> formOf(Map<String, String> values) {
    MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
    values.forEach(form::add);
    return form;
  }

  protected static String buildQueryUrl(String baseUrl, Map<String, String> params) {
    UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(baseUrl);
    params.forEach(builder::queryParam);
    return builder.build().encode().toUriString();
  }

  protected static Map<String, String> linkedMap() {
    return new LinkedHashMap<>();
  }

  protected static Map<String, String> buildMap(Consumer<Map<String, String>> consumer) {
    Map<String, String> map = linkedMap();
    consumer.accept(map);
    return map;
  }
}
