package com.bridgit.api.integrations;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(CloudProvidersProperties.class)
public class IntegrationsConfiguration {
}
