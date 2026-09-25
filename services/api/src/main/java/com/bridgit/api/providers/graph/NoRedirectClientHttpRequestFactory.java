package com.bridgit.api.providers.graph;

import java.net.http.HttpClient;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;

final class NoRedirectClientHttpRequestFactory {

  private NoRedirectClientHttpRequestFactory() {
  }

  static ClientHttpRequestFactory create() {
    HttpClient httpClient = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.NEVER)
        .build();
    return new JdkClientHttpRequestFactory(httpClient);
  }
}
