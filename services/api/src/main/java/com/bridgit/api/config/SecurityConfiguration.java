package com.bridgit.api.config;

import com.bridgit.api.auth.UserRepository;
import com.bridgit.api.common.security.JwtAuthenticationFilter;
import com.bridgit.api.common.security.SecurityUser;
import java.net.URI;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableMethodSecurity
public class SecurityConfiguration {

  @Bean
  public SecurityFilterChain securityFilterChain(
      HttpSecurity http,
      JwtAuthenticationFilter jwtAuthenticationFilter,
      AuthenticationProvider authenticationProvider
  ) throws Exception {
    http
        .csrf(AbstractHttpConfigurer::disable)
        .cors(Customizer.withDefaults())
        .sessionManagement(configurer -> configurer.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/actuator/health", "/actuator/info").permitAll()
            .requestMatchers(HttpMethod.POST, "/api/auth/login", "/api/auth/register")
            .permitAll()
            .requestMatchers(HttpMethod.GET, "/api/providers/*/callback").permitAll()
            .requestMatchers(HttpMethod.GET, "/api/content/**").permitAll()
            .requestMatchers(HttpMethod.GET, "/api/public/links/**").permitAll()
            .anyRequest()
            .authenticated()
        )
        .exceptionHandling(exceptions -> exceptions
            .authenticationEntryPoint((request, response, ex) -> {
              response.setStatus(401);
              response.setContentType("application/json");
              response.getWriter().write(
                  "{\"error\":{\"code\":\"AUTENTICACAO_OBRIGATORIA\",\"message\":\"Voce precisa estar autenticado para continuar.\"}}"
              );
            })
        )
        .authenticationProvider(authenticationProvider)
        .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

    return http.build();
  }

  @Bean
  public CorsConfigurationSource corsConfigurationSource(
      @Value("${app.frontend-base-url}") String frontendBaseUrl,
      @Value("${app.cors.allowed-origins:}") String extraAllowedOrigins
  ) {
    CorsConfiguration configuration = new CorsConfiguration();
    configuration.setAllowedOrigins(allowedOrigins(frontendBaseUrl, extraAllowedOrigins));
    configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    configuration.setAllowedHeaders(List.of("Authorization", "Content-Type"));
    configuration.setExposedHeaders(List.of("Location"));

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", configuration);
    source.registerCorsConfiguration("/actuator/**", configuration);
    return source;
  }

  @Bean
  public UserDetailsService userDetailsService(UserRepository userRepository) {
    return username -> userRepository.findByUsernameKey(username.toLowerCase(Locale.ROOT))
        .map(user -> new SecurityUser(user.getId(), null, user.getUsername(), user.getPasswordHash()))
        .orElseThrow(() -> new org.springframework.security.core.userdetails.UsernameNotFoundException("Usuario nao encontrado."));
  }

  @Bean
  public AuthenticationProvider authenticationProvider(
      UserDetailsService userDetailsService,
      PasswordEncoder passwordEncoder
  ) {
    DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
    provider.setUserDetailsService(userDetailsService);
    provider.setPasswordEncoder(passwordEncoder);
    return provider;
  }

  @Bean
  public AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) throws Exception {
    return configuration.getAuthenticationManager();
  }

  @Bean
  public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  private static List<String> allowedOrigins(String frontendBaseUrl, String extraAllowedOrigins) {
    LinkedHashSet<String> origins = new LinkedHashSet<>();
    addOrigin(origins, frontendBaseUrl);

    if (extraAllowedOrigins != null && !extraAllowedOrigins.isBlank()) {
      Arrays.stream(extraAllowedOrigins.split(","))
          .map(String::trim)
          .filter(origin -> !origin.isBlank())
          .forEach(origin -> addOrigin(origins, origin));
    }

    return List.copyOf(origins);
  }

  private static void addOrigin(LinkedHashSet<String> origins, String value) {
    if (value == null || value.isBlank()) {
      return;
    }
    String trimmed = value.trim();
    if ("*".equals(trimmed)) {
      origins.add(trimmed);
      return;
    }
    URI uri = URI.create(trimmed);
    origins.add(uri.getScheme() + "://" + uri.getAuthority());
  }
}
