package com.bridgit.api.integrations;

import com.bridgit.api.providers.ProviderApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Consumer;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

abstract class AbstractProviderOAuthClient implements ProviderOAuthClient {

  protected final CloudProvidersProperties properties;
  protected final RestClient restClient;
  protected final ObjectMapper objectMapper;

  protected AbstractProviderOAuthClient(
      CloudProvidersProperties properties,
      RestClient restClient,
      ObjectMapper objectMapper
  ) {
    this.properties = properties;
    this.restClient = restClient;
    this.objectMapper = objectMapper;
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
          "O provedor de nuvem nao esta configurado corretamente."
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
    return new ProviderApiException("Nao foi possivel concluir a autenticacao com o provedor.");
  }

  private static ProviderApiException transientFailure() {
    return new ProviderApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "PROVEDOR_INDISPONIVEL",
        "O provedor de nuvem esta indisponivel. Tente novamente em instantes."
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
