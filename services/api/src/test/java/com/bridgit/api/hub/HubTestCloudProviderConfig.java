package com.bridgit.api.hub;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;

@TestConfiguration
public class HubTestCloudProviderConfig {

  @Bean
  @Order(Ordered.HIGHEST_PRECEDENCE)
  FakeOneDriveClient fakeOneDriveClient() {
    return new FakeOneDriveClient();
  }
}
