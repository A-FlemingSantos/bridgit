package com.bridgit.api.common.error;

import com.bridgit.api.common.api.ApiEnvelope;
import com.bridgit.api.common.api.ApiErrorResponse;
import com.bridgit.api.common.api.ApiValidationError;
import com.bridgit.api.common.api.UploadLimits;
import com.bridgit.api.providers.ProviderApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.sql.SQLException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.ServletRequestBindingException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;

@RestControllerAdvice
public class GlobalExceptionHandler {

  private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);
  // SQL Server error numbers: unique constraint, unique index, and string truncation (new and legacy).
  private static final int SQL_UNIQUE_CONSTRAINT = 2627;
  private static final int SQL_UNIQUE_INDEX = 2601;
  private static final int SQL_TRUNCATED = 2628;
  private static final int SQL_TRUNCATED_LEGACY = 8152;
  private final Clock clock;

  public GlobalExceptionHandler(Clock clock) {
    this.clock = clock;
  }

  @ExceptionHandler(ApiException.class)
  public ResponseEntity<ApiEnvelope<Void>> handleApiException(ApiException ex, HttpServletRequest request) {
    HttpStatus status = ex.getStatus();
    String code = ex.getCode();
    if (ex instanceof ProviderApiException providerEx
        && "TOKEN_PROVEDOR_INVALIDO".equals(code)
        && status == HttpStatus.UNAUTHORIZED) {
      status = HttpStatus.BAD_GATEWAY;
    }
    ResponseEntity<ApiEnvelope<Void>> response = buildResponse(
        status,
        code,
        ex.getMessage(),
        request.getRequestURI(),
        List.of()
    );
    if (ex.getRetryAfterSeconds() != null) {
      return ResponseEntity.status(response.getStatusCode())
          .header("Retry-After", String.valueOf(ex.getRetryAfterSeconds()))
          .body(response.getBody());
    }
    return response;
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<ApiEnvelope<Void>> handleValidation(
      MethodArgumentNotValidException ex,
      HttpServletRequest request
  ) {
    List<ApiValidationError> validations = ex.getBindingResult()
        .getFieldErrors()
        .stream()
        .map(this::toValidationError)
        .toList();

    return buildResponse(
        HttpStatus.BAD_REQUEST,
        "VALIDACAO_INVALIDA",
        "Os dados enviados são inválidos.",
        request.getRequestURI(),
        validations
    );
  }

  @ExceptionHandler(BadCredentialsException.class)
  public ResponseEntity<ApiEnvelope<Void>> handleBadCredentials(
      BadCredentialsException ex,
      HttpServletRequest request
  ) {
    return buildResponse(
        HttpStatus.UNAUTHORIZED,
        "CREDENCIAIS_INVALIDAS",
        "Usuário ou senha inválidos.",
        request.getRequestURI(),
        List.of()
    );
  }

  @ExceptionHandler(AccessDeniedException.class)
  public ResponseEntity<ApiEnvelope<Void>> handleAccessDenied(
      AccessDeniedException ex,
      HttpServletRequest request
  ) {
    return buildResponse(
        HttpStatus.FORBIDDEN,
        "ACESSO_NEGADO",
        "Você não tem permissão para executar esta ação.",
        request.getRequestURI(),
        List.of()
    );
  }

  @ExceptionHandler({
      HttpMessageNotReadableException.class,
      MethodArgumentTypeMismatchException.class
  })
  public ResponseEntity<ApiEnvelope<Void>> handleBadRequest(
      Exception ex,
      HttpServletRequest request
  ) {
    return buildResponse(
        HttpStatus.BAD_REQUEST,
        "REQUISICAO_INVALIDA",
        "Os dados enviados são inválidos.",
        request.getRequestURI(),
        List.of()
    );
  }

  @ExceptionHandler(MaxUploadSizeExceededException.class)
  public ResponseEntity<ApiEnvelope<Void>> handleMaxUploadSize(
      MaxUploadSizeExceededException ex,
      HttpServletRequest request
  ) {
    return buildResponse(
        HttpStatus.PAYLOAD_TOO_LARGE,
        "ARQUIVO_GRANDE_DEMAIS",
        "O arquivo excede o limite de " + UploadLimits.MAX_LABEL + ".",
        request.getRequestURI(),
        List.of()
    );
  }

  @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
  public ResponseEntity<ApiEnvelope<Void>> handleMethodNotSupported(
      HttpRequestMethodNotSupportedException ex,
      HttpServletRequest request
  ) {
    return buildResponse(
        HttpStatus.METHOD_NOT_ALLOWED,
        "METODO_NAO_PERMITIDO",
        "Este endereço não aceita o método " + ex.getMethod() + ".",
        request.getRequestURI(),
        List.of()
    );
  }

  @ExceptionHandler(MissingServletRequestParameterException.class)
  public ResponseEntity<ApiEnvelope<Void>> handleMissingParameter(
      MissingServletRequestParameterException ex,
      HttpServletRequest request
  ) {
    return missing("o parâmetro '" + ex.getParameterName() + "'", request);
  }

  @ExceptionHandler(MissingServletRequestPartException.class)
  public ResponseEntity<ApiEnvelope<Void>> handleMissingPart(
      MissingServletRequestPartException ex,
      HttpServletRequest request
  ) {
    return missing("a parte '" + ex.getRequestPartName() + "' do formulário", request);
  }

  @ExceptionHandler(MissingRequestHeaderException.class)
  public ResponseEntity<ApiEnvelope<Void>> handleMissingHeader(
      MissingRequestHeaderException ex,
      HttpServletRequest request
  ) {
    return missing("o cabeçalho '" + ex.getHeaderName() + "'", request);
  }

  @ExceptionHandler({
      ServletRequestBindingException.class,
      MultipartException.class
  })
  public ResponseEntity<ApiEnvelope<Void>> handleUnreadableRequest(
      Exception ex,
      HttpServletRequest request
  ) {
    return buildResponse(
        HttpStatus.BAD_REQUEST,
        "REQUISICAO_INVALIDA",
        "Os dados enviados são inválidos.",
        request.getRequestURI(),
        List.of()
    );
  }

  @ExceptionHandler({
      HandlerMethodValidationException.class,
      ConstraintViolationException.class
  })
  public ResponseEntity<ApiEnvelope<Void>> handleParameterValidation(
      Exception ex,
      HttpServletRequest request
  ) {
    return buildResponse(
        HttpStatus.BAD_REQUEST,
        "VALIDACAO_INVALIDA",
        "Os dados enviados são inválidos.",
        request.getRequestURI(),
        List.of()
    );
  }

  @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
  public ResponseEntity<ApiEnvelope<Void>> handleMediaTypeNotSupported(
      HttpMediaTypeNotSupportedException ex,
      HttpServletRequest request
  ) {
    return buildResponse(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        "TIPO_NAO_SUPORTADO",
        "O formato do corpo da requisição não é aceito neste endereço.",
        request.getRequestURI(),
        List.of()
    );
  }

  @ExceptionHandler({
      NoResourceFoundException.class,
      NoHandlerFoundException.class
  })
  public ResponseEntity<ApiEnvelope<Void>> handleNoResource(
      Exception ex,
      HttpServletRequest request
  ) {
    return buildResponse(
        HttpStatus.NOT_FOUND,
        "RECURSO_NAO_ENCONTRADO",
        "Endereço não encontrado.",
        request.getRequestURI(),
        List.of()
    );
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  public ResponseEntity<ApiEnvelope<Void>> handleDataIntegrityViolation(
      DataIntegrityViolationException ex,
      HttpServletRequest request
  ) {
    logger.warn("Data integrity violation processing request path={}", request.getRequestURI(), ex);
    int sqlError = ex.getMostSpecificCause() instanceof SQLException sql ? sql.getErrorCode() : 0;
    if (ex instanceof DuplicateKeyException || sqlError == SQL_UNIQUE_CONSTRAINT || sqlError == SQL_UNIQUE_INDEX) {
      return buildResponse(
          HttpStatus.CONFLICT,
          "CONFLITO_DADOS",
          "Já existe um registro com estes dados. Atualize e tente de novo.",
          request.getRequestURI(),
          List.of()
      );
    }
    if (sqlError == SQL_TRUNCATED || sqlError == SQL_TRUNCATED_LEGACY) {
      return buildResponse(
          HttpStatus.BAD_REQUEST,
          "DADOS_INVALIDOS",
          "Os dados enviados excedem os limites permitidos.",
          request.getRequestURI(),
          List.of()
      );
    }
    return buildResponse(
        HttpStatus.BAD_REQUEST,
        "DADOS_INVALIDOS",
        "Os dados enviados são inválidos.",
        request.getRequestURI(),
        List.of()
    );
  }

  @ExceptionHandler(AsyncRequestNotUsableException.class)
  public void handleDisconnectedAsyncResponse(AsyncRequestNotUsableException ex) {
    // The framework may flush again after a streaming callback has ended.
    // A disconnected client cannot receive a JSON error response.
    logger.debug("Asynchronous response is no longer writable", ex);
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<ApiEnvelope<Void>> handleUnexpected(
      Exception ex,
      HttpServletRequest request
  ) {
    logger.error("Unexpected error processing request path={}", request.getRequestURI(), ex);
    return buildResponse(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "ERRO_INTERNO",
        "Ocorreu um erro inesperado ao processar a solicitação.",
        request.getRequestURI(),
        List.of()
    );
  }

  private ResponseEntity<ApiEnvelope<Void>> missing(String what, HttpServletRequest request) {
    return buildResponse(
        HttpStatus.BAD_REQUEST,
        "REQUISICAO_INVALIDA",
        "Falta " + what + ".",
        request.getRequestURI(),
        List.of()
    );
  }

  private ResponseEntity<ApiEnvelope<Void>> buildResponse(
      HttpStatus status,
      String code,
      String message,
      String path,
      List<ApiValidationError> validations
  ) {
    ApiErrorResponse error = new ApiErrorResponse(
        code,
        message,
        path,
        OffsetDateTime.now(clock),
        validations.isEmpty() ? null : validations
    );

    return ResponseEntity.status(status).body(ApiEnvelope.error(error));
  }

  private ApiValidationError toValidationError(FieldError error) {
    return new ApiValidationError(error.getField(), error.getDefaultMessage());
  }
}
