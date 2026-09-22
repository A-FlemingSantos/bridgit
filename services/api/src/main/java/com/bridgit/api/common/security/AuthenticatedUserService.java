package com.bridgit.api.common.security;

import com.bridgit.api.auth.UserEntity;
import com.bridgit.api.auth.UserRepository;
import com.bridgit.api.common.error.UnauthorizedException;
import java.util.Optional;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
public class AuthenticatedUserService {

  private final UserRepository userRepository;

  public AuthenticatedUserService(UserRepository userRepository) {
    this.userRepository = userRepository;
  }

  public SecurityUser requirePrincipal() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null || !(authentication.getPrincipal() instanceof SecurityUser principal)) {
      throw new UnauthorizedException("AUTENTICACAO_OBRIGATORIA", "Voce precisa estar autenticado para continuar.");
    }
    return principal;
  }

  public UUID requireUserId() {
    return requirePrincipal().getUserId();
  }

  public Optional<UUID> findUserId() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null || !(authentication.getPrincipal() instanceof SecurityUser principal)) {
      return Optional.empty();
    }
    return Optional.ofNullable(principal.getUserId());
  }

  public UUID requireSessionId() {
    UUID sessionId = requirePrincipal().getSessionId();
    if (sessionId == null) {
      throw new UnauthorizedException("SESSAO_INVALIDA", "Nao foi possivel identificar a sessao autenticada.");
    }
    return sessionId;
  }

  public UserEntity requireUser() {
    UUID userId = requireUserId();
    return userRepository.findById(userId)
        .orElseThrow(() -> new UnauthorizedException("USUARIO_INVALIDO", "Nao foi possivel identificar o usuario autenticado."));
  }
}
