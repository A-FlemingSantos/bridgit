package com.bridgit.api.providers.graph;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;

public final class NoRedirectClientHttpRequestFactory {

  public static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
  public static final Duration READ_TIMEOUT = Duration.ofSeconds(30);

  private NoRedirectClientHttpRequestFactory() {
  }

  public static ClientHttpRequestFactory create() {
    return create(HttpClient.newBuilder());
  }

  /**
   * Same factory pinned to HTTP/1.1. Over HTTP/2 the JDK client leaves out Content-Length on an empty body,
   * and OneDrive answers such a PUT with 411 Length Required.
   */
  public static ClientHttpRequestFactory createHttp11() {
    return create(HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1));
  }

  private static ClientHttpRequestFactory create(HttpClient.Builder builder) {
    HttpClient httpClient = builder
        .followRedirects(HttpClient.Redirect.NEVER)
        .connectTimeout(CONNECT_TIMEOUT)
        .build();
    JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
    factory.setReadTimeout(READ_TIMEOUT);
    return factory;
  }
}
