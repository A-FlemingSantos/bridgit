package com.bridgit.api.auth;

import com.bridgit.api.common.error.TooManyRequestsException;
import com.bridgit.api.common.security.RateLimiter;
import java.time.Clock;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Counts failed logins per username and per client address, in memory. */
@Component
public class LoginAttemptLimiter {

  private static final int MAX_KEYS = 50_000;

  private final RateLimiter perUser;
  private final RateLimiter perAddress;

  public LoginAttemptLimiter(
      @Value("${app.auth.login-max-failures-per-user:5}") int maxPerUser,
      @Value("${app.auth.login-max-failures-per-address:20}") int maxPerAddress,
      @Value("${app.auth.login-failure-window-minutes:15}") long windowMinutes,
      Clock clock
  ) {
    Duration window = Duration.ofMinutes(windowMinutes);
    this.perUser = new RateLimiter(maxPerUser, window, MAX_KEYS, clock);
    this.perAddress = new RateLimiter(maxPerAddress, window, MAX_KEYS, clock);
  }

  public void check(String usernameKey, String address) {
    long retryAfter = Math.max(perUser.retryAfterSeconds(usernameKey), perAddress.retryAfterSeconds(address(address)));
    if (retryAfter > 0) {
      throw new TooManyRequestsException(
          "MUITAS_TENTATIVAS",
          "Muitas tentativas de login. Aguarde alguns minutos e tente de novo.",
          retryAfter
      );
    }
  }

  public void failed(String usernameKey, String address) {
    if (usernameKey != null && !usernameKey.isBlank()) perUser.record(usernameKey);
    perAddress.record(address(address));
  }

  public void succeeded(String usernameKey) {
    perUser.reset(usernameKey);
  }

  private static String address(String address) {
    return address == null ? "" : address;
  }
}
