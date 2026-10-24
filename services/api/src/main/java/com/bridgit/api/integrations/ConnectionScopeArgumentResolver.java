package com.bridgit.api.integrations;

import com.bridgit.api.common.error.ConflictException;
import com.bridgit.api.common.security.AuthenticatedUserService;
import com.bridgit.api.providers.CloudProvider;
import java.util.Map;
import java.util.UUID;
import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import org.springframework.web.servlet.HandlerMapping;

/** Resolves a {@link ConnectionScope} parameter from {@code {connectionId}} or {@code {provider}}. */
@Component
public class ConnectionScopeArgumentResolver implements HandlerMethodArgumentResolver {

  private final ProviderConnectionService connectionService;
  private final AuthenticatedUserService authenticatedUserService;

  public ConnectionScopeArgumentResolver(
      ProviderConnectionService connectionService,
      AuthenticatedUserService authenticatedUserService
  ) {
    this.connectionService = connectionService;
    this.authenticatedUserService = authenticatedUserService;
  }

  @Override
  public boolean supportsParameter(MethodParameter parameter) {
    return ConnectionScope.class.equals(parameter.getParameterType());
  }

  @Override
  public ConnectionScope resolveArgument(
      MethodParameter parameter,
      ModelAndViewContainer mavContainer,
      NativeWebRequest webRequest,
      WebDataBinderFactory binderFactory
  ) {
    @SuppressWarnings("unchecked")
    Map<String, String> variables = (Map<String, String>) webRequest.getAttribute(
        HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE,
        RequestAttributes.SCOPE_REQUEST
    );
    UUID userId = authenticatedUserService.requireUserId();
    String connectionId = variables == null ? null : variables.get("connectionId");
    if (connectionId != null) {
      return ConnectionScope.of(userId, connectionService.requireOwnedConnection(userId, parseId(connectionId)));
    }
    String provider = variables == null ? null : variables.get("provider");
    CloudProvider cloudProvider = CloudProvider.fromId(provider);
    return new ConnectionScope(userId, connectionService.requireDefaultConnection(userId, cloudProvider), cloudProvider);
  }

  private static UUID parseId(String value) {
    try {
      return UUID.fromString(value);
    } catch (IllegalArgumentException ex) {
      throw new ConflictException("PROVEDOR_NAO_CONECTADO", "Conecte este provedor de nuvem antes de continuar.");
    }
  }
}
