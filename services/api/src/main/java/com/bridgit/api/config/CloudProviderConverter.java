package com.bridgit.api.config;

import com.bridgit.api.providers.CloudProvider;
import org.springframework.core.convert.converter.Converter;
import org.springframework.stereotype.Component;

@Component
public class CloudProviderConverter implements Converter<String, CloudProvider> {

  @Override
  public CloudProvider convert(String source) {
    return CloudProvider.fromId(source);
  }
}
