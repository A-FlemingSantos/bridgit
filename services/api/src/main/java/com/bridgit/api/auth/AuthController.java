package com.bridgit.api.auth;

import com.bridgit.api.common.api.ApiEnvelope;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/auth")
public class AuthController {

  private final AuthService authService;

  public AuthController(AuthService authService) {
    this.authService = authService;
  }

  @PostMapping("/register")
  public ApiEnvelope<AuthDtos.SessionResponse> register(
      @Valid @RequestBody RegisterRequest request,
      HttpServletRequest httpRequest
  ) {
    return ApiEnvelope.ok(authService.register(
        request.username(),
        request.password(),
        request.deviceKey(),
        Boolean.TRUE.equals(request.persistent()),
        httpRequest.getHeader("User-Agent")
    ));
  }

  @PostMapping("/login")
  public ApiEnvelope<AuthDtos.SessionResponse> login(
      @Valid @RequestBody LoginRequest request,
      HttpServletRequest httpRequest
  ) {
    return ApiEnvelope.ok(authService.login(
        request.username(),
        request.password(),
        request.deviceKey(),
        Boolean.TRUE.equals(request.persistent()),
        httpRequest.getHeader("User-Agent")
    ));
  }

  @PostMapping("/refresh")
  public ApiEnvelope<AuthDtos.SessionResponse> refresh() {
    return ApiEnvelope.ok(authService.refreshSession());
  }

  @PostMapping("/logout")
  public ApiEnvelope<AuthDtos.MessageResponse> logout() {
    return ApiEnvelope.ok(authService.logout());
  }

  @PatchMapping("/session")
  public ApiEnvelope<AuthDtos.SessionSummary> updateSession(@Valid @RequestBody UpdateSessionRequest request) {
    return ApiEnvelope.ok(authService.updateSessionPersistent(request.persistent()));
  }

  @GetMapping("/sessions")
  public ApiEnvelope<List<AuthDtos.SessionListItem>> listSessions() {
    return ApiEnvelope.ok(authService.listSessions());
  }

  @PostMapping("/sessions/revoke-others")
  public ApiEnvelope<AuthDtos.MessageResponse> revokeOtherSessions() {
    return ApiEnvelope.ok(authService.revokeOtherSessions());
  }

  public record RegisterRequest(
      @NotBlank(message = "O usuario e obrigatorio.")
      @Size(min = 3, max = 32, message = "O usuario deve ter entre 3 e 32 caracteres.")
      @Pattern(regexp = "^[A-Za-z0-9._-]+$", message = "O usuario deve usar apenas letras, numeros, ponto, hifen ou sublinhado.")
      String username,
      @NotBlank(message = "A senha e obrigatoria.")
      @Size(min = 8, message = "A senha deve ter pelo menos 8 caracteres.")
      String password,
      @NotNull(message = "O identificador do dispositivo e obrigatorio.") UUID deviceKey,
      Boolean persistent
  ) {
  }

  public record LoginRequest(
      @NotBlank(message = "O usuario e obrigatorio.") String username,
      @NotBlank(message = "A senha e obrigatoria.") String password,
      @NotNull(message = "O identificador do dispositivo e obrigatorio.") UUID deviceKey,
      Boolean persistent
  ) {
  }

  public record UpdateSessionRequest(
      @NotNull(message = "O campo persistent e obrigatorio.") Boolean persistent
  ) {
  }
}
