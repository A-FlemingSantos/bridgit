package com.bridgit.api.integrations;

import java.util.List;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class ConnectionWebConfig implements WebMvcConfigurer {

  private final ConnectionScopeArgumentResolver connectionScopeArgumentResolver;

  public ConnectionWebConfig(ConnectionScopeArgumentResolver connectionScopeArgumentResolver) {
    this.connectionScopeArgumentResolver = connectionScopeArgumentResolver;
  }

  @Override
  public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
    resolvers.add(connectionScopeArgumentResolver);
  }
}
