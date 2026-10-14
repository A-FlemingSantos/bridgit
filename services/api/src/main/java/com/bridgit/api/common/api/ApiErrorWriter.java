package com.bridgit.api.common.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.OffsetDateTime;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

/**
 * Writes the error envelope straight to the response, for code that runs before the
 * controllers (filters, security handlers), with the same shape as GlobalExceptionHandler.
 */
@Component
public class ApiErrorWriter {

  private final ObjectMapper objectMapper;
  private final Clock clock;

  public ApiErrorWriter(ObjectMapper objectMapper, Clock clock) {
    this.objectMapper = objectMapper;
    this.clock = clock;
  }

  public void write(
      HttpServletRequest request,
      HttpServletResponse response,
      HttpStatus status,
      String code,
      String message
  ) throws IOException {
    if (response.isCommitted()) {
      return;
    }

    ApiErrorResponse error = new ApiErrorResponse(
        code,
        message,
        request.getRequestURI(),
        OffsetDateTime.now(clock),
        null
    );

    response.setStatus(status.value());
    response.setCharacterEncoding(StandardCharsets.UTF_8.name());
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    objectMapper.writeValue(response.getWriter(), ApiEnvelope.error(error));
  }
}
