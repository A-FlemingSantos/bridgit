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
    HttpClient httpClient = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.NEVER)
        .connectTimeout(CONNECT_TIMEOUT)
        .build();
    JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
    factory.setReadTimeout(READ_TIMEOUT);
    return factory;
  }
}
