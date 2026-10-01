package com.bridgit.api.catalog;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
public class LocalHubConfiguration implements org.springframework.web.servlet.config.annotation.WebMvcConfigurer {
  @Override
  public void configureAsyncSupport(org.springframework.web.servlet.config.annotation.AsyncSupportConfigurer configurer) {
    configurer.setTaskExecutor(new org.springframework.core.task.VirtualThreadTaskExecutor("hub-events-"));
    configurer.setDefaultTimeout(30000);
  }
}
