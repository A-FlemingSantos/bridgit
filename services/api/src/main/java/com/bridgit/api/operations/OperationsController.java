package com.bridgit.api.operations;

import com.bridgit.api.common.api.ApiEnvelope;
import com.bridgit.api.common.error.BadRequestException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/operations")
public class OperationsController {
  private final OperationService operations;
  private final ObjectMapper json;
  public OperationsController(OperationService operations, ObjectMapper json) { this.operations = operations; this.json = json; }
  @PostMapping public ResponseEntity<ApiEnvelope<OperationDtos.View>> submit(@RequestBody OperationDtos.Request request) {
    return ResponseEntity.accepted().body(ApiEnvelope.ok(operations.submit(request)));
  }
  @PostMapping(value = "/uploads", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  // The "request" part is read as text and parsed here, so it works whether the client marks it as
  // application/json (browsers) or sends a plain form field (React Native cannot send a JSON Blob).
  public ResponseEntity<ApiEnvelope<OperationDtos.View>> upload(@RequestPart("request") String request, @RequestPart("file") MultipartFile file) {
    return ResponseEntity.accepted().body(ApiEnvelope.ok(operations.upload(readRequest(json, request), file.getSize(), file)));
  }
  static OperationDtos.Request readRequest(ObjectMapper json, String body) {
    try {
      OperationDtos.Request request = json.readValue(body, OperationDtos.Request.class);
      if (request == null) throw new BadRequestException("OPERACAO_INVALIDA", "Informe a operação de upload.");
      return request;
    } catch (JsonProcessingException ex) {
      throw new BadRequestException("OPERACAO_INVALIDA", "Operação de upload inválida.");
    }
  }
  @GetMapping public ApiEnvelope<List<OperationDtos.View>> pending() { return ApiEnvelope.ok(operations.pending()); }
  @GetMapping("/{id}") public ApiEnvelope<OperationDtos.View> get(@PathVariable UUID id) { return ApiEnvelope.ok(operations.get(id)); }
  @PostMapping("/{id}/retry") public ApiEnvelope<OperationDtos.View> retry(@PathVariable UUID id) { return ApiEnvelope.ok(operations.retry(id)); }
}
