package com.bridgit.api.auth;

import com.bridgit.api.common.error.BadRequestException;
import com.bridgit.api.common.error.ConflictException;
import com.bridgit.api.common.security.AuthenticatedUserService;
import com.bridgit.api.common.security.JwtService;
import java.util.UUID;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

  private final UserRepository userRepository;
  private final PasswordEncoder passwordEncoder;
  private final AuthenticationManager authenticationManager;
  private final JwtService jwtService;
  private final AuthenticatedUserService authenticatedUserService;
  private final UserSessionService userSessionService;

  public AuthService(
      UserRepository userRepository,
      PasswordEncoder passwordEncoder,
      AuthenticationManager authenticationManager,
      JwtService jwtService,
      AuthenticatedUserService authenticatedUserService,
      UserSessionService userSessionService
  ) {
    this.userRepository = userRepository;
    this.passwordEncoder = passwordEncoder;
    this.authenticationManager = authenticationManager;
    this.jwtService = jwtService;
    this.authenticatedUserService = authenticatedUserService;
    this.userSessionService = userSessionService;
  }

  @Transactional
  public AuthDtos.SessionResponse register(
      String username,
      String password,
      UUID deviceKey,
      boolean persistent,
      String userAgent
  ) {
    String normalizedUsername = UsernameRules.normalizeUsername(username);
    String usernameKey = UsernameRules.usernameKey(normalizedUsername);
    validatePassword(password);

    if (userRepository.existsByUsernameKey(usernameKey)) {
      throw new ConflictException("USUARIO_EM_USO", "Ja existe uma conta cadastrada com este usuario.");
    }

    UserEntity user = new UserEntity();
    user.setUsername(normalizedUsername);
    user.setUsernameKey(usernameKey);
    user.setPasswordHash(passwordEncoder.encode(password));
    userRepository.save(user);

    UserSessionEntity session = userSessionService.createSession(user.getId(), deviceKey, persistent, userAgent);
    return buildSessionResponse(user, session);
  }

  @Transactional
  public AuthDtos.SessionResponse login(
      String username,
      String password,
      UUID deviceKey,
      boolean persistent,
      String userAgent
  ) {
    String usernameKey = username == null ? "" : username.trim().toLowerCase(java.util.Locale.ROOT);
    if (usernameKey.isBlank()) {
      throw new BadCredentialsException("Usuario ou senha invalidos.");
    }

    UserEntity user = userRepository.findByUsernameKey(usernameKey)
        .orElseThrow(() -> new BadCredentialsException("Usuario ou senha invalidos."));

    authenticationManager.authenticate(
        new UsernamePasswordAuthenticationToken(usernameKey, password)
    );

    UserSessionEntity session = userSessionService.createSession(user.getId(), deviceKey, persistent, userAgent);
    return buildSessionResponse(user, session);
  }

  @Transactional
  public AuthDtos.SessionResponse refreshSession() {
    UserEntity user = authenticatedUserService.requireUser();
    UUID sessionId = authenticatedUserService.requireSessionId();
    UserSessionEntity session = userSessionService.requireActiveSession(user.getId(), sessionId);
    userSessionService.touchSession(session);
    return buildSessionResponse(user, session);
  }

  @Transactional
  public AuthDtos.MessageResponse logout() {
    UUID userId = authenticatedUserService.requireUserId();
    UUID sessionId = authenticatedUserService.requireSessionId();
    userSessionService.revokeCurrentSession(userId, sessionId);
    return new AuthDtos.MessageResponse("Sessao encerrada com sucesso.");
  }

  @Transactional
  public AuthDtos.SessionSummary updateSessionPersistent(boolean persistent) {
    UUID userId = authenticatedUserService.requireUserId();
    UUID sessionId = authenticatedUserService.requireSessionId();
    UserSessionEntity session = userSessionService.updatePersistent(userId, sessionId, persistent);
    return toSessionSummary(session);
  }

  @Transactional
  public AuthDtos.MessageResponse revokeOtherSessions() {
    userSessionService.revokeOtherSessions(
        authenticatedUserService.requireUserId(),
        authenticatedUserService.requireSessionId()
    );
    return new AuthDtos.MessageResponse("As outras sessoes foram encerradas.");
  }

  public AuthDtos.SessionResponse buildSessionResponse(UserEntity user, UserSessionEntity session) {
    String token = jwtService.generateAccessToken(user.getId(), user.getUsername(), session.getId());
    return new AuthDtos.SessionResponse(
        token,
        jwtService.accessTokenExpiresAt(),
        toUserSummary(user),
        toSessionSummary(session)
    );
  }

  private AuthDtos.UserSummary toUserSummary(UserEntity user) {
    return new AuthDtos.UserSummary(user.getId(), user.getUsername());
  }

  private AuthDtos.SessionSummary toSessionSummary(UserSessionEntity session) {
    return new AuthDtos.SessionSummary(session.getId(), session.isPersistent());
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
