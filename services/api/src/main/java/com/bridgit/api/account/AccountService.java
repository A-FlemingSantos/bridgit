package com.bridgit.api.account;

import com.bridgit.api.auth.AuthDtos;
import com.bridgit.api.auth.AuthService;
import com.bridgit.api.auth.UserEntity;
import com.bridgit.api.auth.UserRepository;
import com.bridgit.api.auth.UserSessionEntity;
import com.bridgit.api.auth.UserSessionService;
import com.bridgit.api.auth.UsernameRules;
import com.bridgit.api.common.error.BadRequestException;
import com.bridgit.api.common.error.ConflictException;
import com.bridgit.api.common.security.AuthenticatedUserService;
import java.util.Locale;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountService {

  private final UserRepository userRepository;
  private final PasswordEncoder passwordEncoder;
  private final AuthenticatedUserService authenticatedUserService;
  private final UserSessionService userSessionService;
  private final AuthService authService;

  public AccountService(
      UserRepository userRepository,
      PasswordEncoder passwordEncoder,
      AuthenticatedUserService authenticatedUserService,
      UserSessionService userSessionService,
      AuthService authService
  ) {
    this.userRepository = userRepository;
    this.passwordEncoder = passwordEncoder;
    this.authenticatedUserService = authenticatedUserService;
    this.userSessionService = userSessionService;
    this.authService = authService;
  }

  @Transactional(readOnly = true)
  public AuthDtos.AccountResponse getAccount() {
    UserEntity user = authenticatedUserService.requireUser();
    return new AuthDtos.AccountResponse(user.getId(), user.getUsername());
  }

  @Transactional
  public AuthDtos.SessionResponse updateUsername(String username) {
    UserEntity user = authenticatedUserService.requireUser();
    String normalizedUsername = UsernameRules.normalizeUsername(username);
    String usernameKey = normalizedUsername.toLowerCase(Locale.ROOT);

    if (!usernameKey.equals(user.getUsernameKey()) && userRepository.existsByUsernameKey(usernameKey)) {
      throw new ConflictException("USUARIO_EM_USO", "Ja existe uma conta cadastrada com este usuario.");
    }

    user.setUsername(normalizedUsername);
    user.setUsernameKey(usernameKey);
    userRepository.save(user);

    UUID sessionId = authenticatedUserService.requireSessionId();
    UserSessionEntity session = userSessionService.requireActiveSession(user.getId(), sessionId);
    return authService.buildSessionResponse(user, session);
  }

  @Transactional
  public AuthDtos.MessageResponse changePassword(String currentPassword, String newPassword) {
    UserEntity user = authenticatedUserService.requireUser();

    if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
      throw new BadRequestException("SENHA_ATUAL_INVALIDA", "A senha atual informada esta incorreta.");
    }

    validatePassword(newPassword);
    user.setPasswordHash(passwordEncoder.encode(newPassword));
    userRepository.save(user);
    userSessionService.revokeOtherSessions(user.getId(), authenticatedUserService.requireSessionId());

    return new AuthDtos.MessageResponse("Senha atualizada com sucesso.");
  }

  @Transactional
  public AuthDtos.MessageResponse deleteAccount() {
    UserEntity user = authenticatedUserService.requireUser();
    userRepository.delete(user);
    return new AuthDtos.MessageResponse("Conta removida com sucesso.");
  }

  private void validatePassword(String password) {
    if (password == null || password.isBlank()) {
      throw new BadRequestException("SENHA_OBRIGATORIA", "A senha e obrigatoria.");
    }
    if (password.length() < 8) {
      throw new BadRequestException("SENHA_INVALIDA", "A senha deve ter pelo menos 8 caracteres.");
    }
  }
}
