package com.bridgit.api.operations;

import com.bridgit.api.common.api.ApiEnvelope;
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
  public OperationsController(OperationService operations) { this.operations = operations; }
  @PostMapping public ResponseEntity<ApiEnvelope<OperationDtos.View>> submit(@RequestBody OperationDtos.Request request) {
    return ResponseEntity.accepted().body(ApiEnvelope.ok(operations.submit(request)));
  }
  @PostMapping(value = "/uploads", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<ApiEnvelope<OperationDtos.View>> upload(@RequestPart("request") OperationDtos.Request request, @RequestPart("file") MultipartFile file) {
    return ResponseEntity.accepted().body(ApiEnvelope.ok(operations.upload(request, file.getSize(), file)));
  }
  @GetMapping public ApiEnvelope<List<OperationDtos.View>> pending() { return ApiEnvelope.ok(operations.pending()); }
  @GetMapping("/{id}") public ApiEnvelope<OperationDtos.View> get(@PathVariable UUID id) { return ApiEnvelope.ok(operations.get(id)); }
  @PostMapping("/{id}/retry") public ApiEnvelope<OperationDtos.View> retry(@PathVariable UUID id) { return ApiEnvelope.ok(operations.retry(id)); }
}
