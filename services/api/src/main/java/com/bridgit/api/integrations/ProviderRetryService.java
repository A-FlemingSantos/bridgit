package com.bridgit.api.integrations;

import com.bridgit.api.providers.ProviderApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class ProviderRetryService {

  private final ProviderConnectionService connectionService;

  public ProviderRetryService(ProviderConnectionService connectionService) {
    this.connectionService = connectionService;
  }

  public <T> T withRetry(ProviderConnectionEntity connection, TokenCall<T> call) {
    String token = connectionService.accessToken(connection);
    try {
      return call.execute(token);
    } catch (ProviderApiException ex) {
      if (ex.getStatus() == HttpStatus.UNAUTHORIZED) {
        connectionService.evict(connection.getId());
        String refreshed = connectionService.accessToken(connection);
        return call.execute(refreshed);
      }
      throw ex;
    }
  }

  @FunctionalInterface
  public interface TokenCall<T> {
    T execute(String accessToken);
  }
}
