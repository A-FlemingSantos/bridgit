package com.bridgit.api.files;

import com.bridgit.api.common.api.ApiEnvelope;
import com.bridgit.api.hub.LocalSyncFlag;
import com.bridgit.api.integrations.ConnectionScope;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.ContentStream;
import com.bridgit.api.providers.ContentStreamResponder;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping({"/api/providers/{provider}", "/api/connections/{connectionId}"})
public class FilesController {

  private final ProviderFileService providerFileService;
  private final ContentStreamResponder contentStreamResponder;

  public FilesController(ProviderFileService providerFileService, ContentStreamResponder contentStreamResponder) {
    this.providerFileService = providerFileService;
    this.contentStreamResponder = contentStreamResponder;
  }

  @GetMapping("/items")
  public ApiEnvelope<FilesDtos.ListItemsResponse> listItems(
      ConnectionScope scope,
      @RequestParam(required = false) String parent,
      @RequestParam(required = false) String cursor
  ) {
    return ApiEnvelope.ok(providerFileService.listItems(scope, parent, cursor));
  }

  @GetMapping("/items/{ref}")
  public ApiEnvelope<FilesDtos.ItemWithAncestry> getItem(
      ConnectionScope scope,
      @PathVariable String ref
  ) {
    return ApiEnvelope.ok(providerFileService.getItem(scope, ref));
  }

  @PostMapping("/folders")
  public ResponseEntity<ApiEnvelope<CloudItem>> createFolder(
      ConnectionScope scope,
      @Valid @RequestBody FilesDtos.CreateFolderRequest request,
      @RequestHeader(value = "Idempotency-Key", required = false) String clientKey
  ) {
    CloudItem item = providerFileService.createFolder(scope, request.parentRef(), request.name(), clientKey);
    return withLocalSyncHeader(ApiEnvelope.ok(item));
  }

  @PostMapping(value = "/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<ApiEnvelope<CloudItem>> uploadFile(
      ConnectionScope scope,
      @RequestParam(required = false) String parentRef,
      @RequestParam("file") MultipartFile file,
      @RequestHeader(value = "Idempotency-Key", required = false) String clientKey
  ) throws Exception {
    CloudItem item = providerFileService.uploadFile(
        scope,
        parentRef,
        file.getOriginalFilename(),
        file.getContentType(),
        file.getSize(),
        file,
        clientKey
    );
    return withLocalSyncHeader(ApiEnvelope.ok(item));
  }

  @PatchMapping("/items/{ref}")
  public ResponseEntity<ApiEnvelope<CloudItem>> updateItem(
      ConnectionScope scope,
      @PathVariable String ref,
      @RequestBody FilesDtos.UpdateItemRequest request,
      @RequestHeader(value = "Idempotency-Key", required = false) String clientKey
  ) {
    CloudItem item = providerFileService.updateItem(scope, ref, request.name(), request.parentRef(), clientKey);
    return withLocalSyncHeader(ApiEnvelope.ok(item));
  }

  @DeleteMapping("/items/{ref}")
  public ResponseEntity<ApiEnvelope<FilesDtos.DeleteItemResponse>> deleteItem(
      ConnectionScope scope,
      @PathVariable String ref,
      @RequestHeader(value = "Idempotency-Key", required = false) String clientKey
  ) {
    FilesDtos.DeleteItemResponse response = providerFileService.deleteItem(scope, ref, clientKey);
    return withLocalSyncHeader(ApiEnvelope.ok(response));
  }

  @GetMapping("/items/{ref}/thumbnail")
  public void thumbnail(
      ConnectionScope scope,
      @PathVariable String ref,
      HttpServletResponse response
  ) throws IOException {
    ContentStream stream = providerFileService.openThumbnail(scope, ref);
    contentStreamResponder.write(stream, response, false, Map.of("Cache-Control", "private"));
  }

  @GetMapping("/items/{ref}/read")
  public ApiEnvelope<FilesDtos.ReadResponse> readItem(
      ConnectionScope scope,
      @PathVariable String ref,
      @RequestParam(defaultValue = "false") boolean refresh
  ) {
    return ApiEnvelope.ok(providerFileService.readItem(scope, ref, refresh));
  }

  @PostMapping("/items/{ref}/ticket")
  public ApiEnvelope<FilesDtos.TicketResponse> createTicket(
      ConnectionScope scope,
      @PathVariable String ref,
      @RequestBody FilesDtos.TicketRequest request
  ) {
    return ApiEnvelope.ok(providerFileService.createDownloadTicket(scope, ref, request.disposition()));
  }

  private static <T> ResponseEntity<ApiEnvelope<T>> withLocalSyncHeader(ApiEnvelope<T> body) {
    if (LocalSyncFlag.isPending()) {
      return ResponseEntity.ok()
          .header("X-Bridgit-Local-Sync", "pending")
          .body(body);
    }
    return ResponseEntity.ok(body);
  }
}
