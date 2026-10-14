package com.bridgit.api.common.security;

import com.bridgit.api.auth.UserEntity;
import com.bridgit.api.auth.UserRepository;
import com.bridgit.api.auth.UserSessionEntity;
import com.bridgit.api.auth.UserSessionService;
import com.bridgit.api.common.api.ApiErrorWriter;
import com.bridgit.api.common.error.UnauthorizedException;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

  private static final Logger logger = LoggerFactory.getLogger(JwtAuthenticationFilter.class);
  private static final String LOGOUT_PATH = "/api/auth/logout";

  private final JwtService jwtService;
  private final UserRepository userRepository;
  private final UserSessionService userSessionService;
  private final ApiErrorWriter errorWriter;

  public JwtAuthenticationFilter(
      JwtService jwtService,
      UserRepository userRepository,
      UserSessionService userSessionService,
      ApiErrorWriter errorWriter
  ) {
    this.jwtService = jwtService;
    this.userRepository = userRepository;
    this.userSessionService = userSessionService;
    this.errorWriter = errorWriter;
  }

  @Override
  protected boolean shouldNotFilterAsyncDispatch() {
    // Streaming responses are redispatched on another thread when they finish.
    // Authenticate that dispatch too, before the authorization filter evaluates it.
    return false;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request,
      HttpServletResponse response,
      FilterChain filterChain
  ) throws ServletException, IOException {
    String authorization = request.getHeader("Authorization");

    if (authorization == null || !authorization.startsWith("Bearer ")) {
      filterChain.doFilter(request, response);
      return;
    }

    String token = authorization.substring(7);

    try {
      if (!jwtService.isValid(token)) {
        throw new UnauthorizedException("TOKEN_INVALIDO", "Sua sessão expirou. Faça login novamente.");
      }

      java.util.UUID userId = jwtService.extractUserId(token);
      java.util.UUID sessionId = jwtService.extractSessionId(token);
      if (sessionId == null) {
        throw new UnauthorizedException("SESSAO_INVALIDA", "Sua sessão não é mais válida.");
      }

      if (SecurityContextHolder.getContext().getAuthentication() == null) {
        UserSessionEntity session = userSessionService.requireActiveSession(userId, sessionId);
        UserEntity user = userRepository.findById(userId)
            .orElseThrow(() -> new UnauthorizedException("USUARIO_INVALIDO", "Não foi possível identificar o usuário autenticado."));

        SecurityUser principal = new SecurityUser(user.getId(), session.getId(), user.getUsername(), user.getPasswordHash());
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
            principal,
            null,
            principal.getAuthorities()
        );
        authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
        SecurityContextHolder.getContext().setAuthentication(authentication);
        userSessionService.touchSession(session);
      }
    } catch (UnauthorizedException ex) {
      SecurityContextHolder.clearContext();
      if (isLogout(request)) {
        // Logging out of a session that is already over is not an error.
        filterChain.doFilter(request, response);
        return;
      }
      writeUnauthorizedResponse(request, response, ex);
      return;
    } catch (JwtException | IllegalArgumentException ex) {
      SecurityContextHolder.clearContext();
      if (isLogout(request)) {
        filterChain.doFilter(request, response);
        return;
      }
      writeUnauthorizedResponse(
          request,
          response,
          new UnauthorizedException("TOKEN_INVALIDO", "Sua sessão expirou. Faça login novamente.")
      );
      return;
    } catch (RuntimeException ex) {
      // A failure here (for instance the database) is not a bad session: answering 401 would
      // sign the user out. Answer 500 so the client keeps the session and tries again.
      SecurityContextHolder.clearContext();
      logger.error("Session validation failed path={}", request.getRequestURI(), ex);
      errorWriter.write(
          request,
          response,
          HttpStatus.INTERNAL_SERVER_ERROR,
          "ERRO_INTERNO",
          "Ocorreu um erro inesperado ao processar a solicitação."
      );
      return;
    }

    filterChain.doFilter(request, response);
  }

  private static boolean isLogout(HttpServletRequest request) {
    return "POST".equals(request.getMethod()) && LOGOUT_PATH.equals(request.getRequestURI().substring(request.getContextPath().length()));
  }

  private void writeUnauthorizedResponse(
      HttpServletRequest request,
      HttpServletResponse response,
      UnauthorizedException ex
  ) throws IOException {
    errorWriter.write(request, response, ex.getStatus(), ex.getCode(), ex.getMessage());
  }
}
