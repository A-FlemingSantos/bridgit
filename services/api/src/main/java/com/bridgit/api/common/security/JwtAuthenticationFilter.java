package com.bridgit.api.common.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.bridgit.api.auth.UserEntity;
import com.bridgit.api.auth.UserRepository;
import com.bridgit.api.auth.UserSessionEntity;
import com.bridgit.api.auth.UserSessionService;
import com.bridgit.api.common.api.ApiEnvelope;
import com.bridgit.api.common.api.ApiErrorResponse;
import com.bridgit.api.common.error.UnauthorizedException;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.OffsetDateTime;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

  private static final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

  private final JwtService jwtService;
  private final UserRepository userRepository;
  private final UserSessionService userSessionService;

  public JwtAuthenticationFilter(
      JwtService jwtService,
      UserRepository userRepository,
      UserSessionService userSessionService
  ) {
    this.jwtService = jwtService;
    this.userRepository = userRepository;
    this.userSessionService = userSessionService;
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
        throw new UnauthorizedException("TOKEN_INVALIDO", "Sua sessao expirou. Faca login novamente.");
      }

      java.util.UUID userId = jwtService.extractUserId(token);
      java.util.UUID sessionId = jwtService.extractSessionId(token);
      if (sessionId == null) {
        throw new UnauthorizedException("SESSAO_INVALIDA", "Sua sessao nao e mais valida.");
      }

      if (SecurityContextHolder.getContext().getAuthentication() == null) {
        UserSessionEntity session = userSessionService.requireActiveSession(userId, sessionId);
        UserEntity user = userRepository.findById(userId)
            .orElseThrow(() -> new UnauthorizedException("USUARIO_INVALIDO", "Nao foi possivel identificar o usuario autenticado."));

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
      writeUnauthorizedResponse(request, response, ex);
      return;
    } catch (JwtException | IllegalArgumentException ex) {
      SecurityContextHolder.clearContext();
      writeUnauthorizedResponse(
          request,
          response,
          new UnauthorizedException("TOKEN_INVALIDO", "Sua sessao expirou. Faca login novamente.")
      );
      return;
    } catch (RuntimeException ex) {
      SecurityContextHolder.clearContext();
    }

    filterChain.doFilter(request, response);
  }

  private void writeUnauthorizedResponse(
      HttpServletRequest request,
      HttpServletResponse response,
      UnauthorizedException ex
  ) throws IOException {
    if (response.isCommitted()) {
      return;
    }

    ApiErrorResponse error = new ApiErrorResponse(
        ex.getCode(),
        ex.getMessage(),
        request.getRequestURI(),
        OffsetDateTime.now(),
        null
    );

    response.setStatus(ex.getStatus().value());
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    objectMapper.writeValue(response.getWriter(), ApiEnvelope.error(error));
  }
}
