package com.bridgit.api.files;

import com.bridgit.api.common.api.ApiEnvelope;
import com.bridgit.api.hub.LocalSyncFlag;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudProvider;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/providers/{provider}")
public class FilesController {

  private final ProviderFileService providerFileService;

  public FilesController(ProviderFileService providerFileService) {
    this.providerFileService = providerFileService;
  }

  @GetMapping("/items")
  public ApiEnvelope<FilesDtos.ListItemsResponse> listItems(
      @PathVariable CloudProvider provider,
      @RequestParam(required = false) String parent,
      @RequestParam(required = false) String cursor
  ) {
    return ApiEnvelope.ok(providerFileService.listItems(provider, parent, cursor));
  }

  @GetMapping("/items/{ref}")
  public ApiEnvelope<FilesDtos.ItemWithAncestry> getItem(
      @PathVariable CloudProvider provider,
      @PathVariable String ref
  ) {
    return ApiEnvelope.ok(providerFileService.getItem(provider, ref));
  }

  @PostMapping("/folders")
  public ResponseEntity<ApiEnvelope<CloudItem>> createFolder(
      @PathVariable CloudProvider provider,
      @Valid @RequestBody FilesDtos.CreateFolderRequest request
  ) {
    CloudItem item = providerFileService.createFolder(provider, request.parentRef(), request.name());
    return withLocalSyncHeader(ApiEnvelope.ok(item));
  }

  @PostMapping(value = "/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<ApiEnvelope<CloudItem>> uploadFile(
      @PathVariable CloudProvider provider,
      @RequestParam(required = false) String parentRef,
      @RequestParam("file") MultipartFile file
  ) throws Exception {
    CloudItem item = providerFileService.uploadFile(
        provider,
        parentRef,
        file.getOriginalFilename(),
        file.getContentType(),
        file.getSize(),
        file
    );
    return withLocalSyncHeader(ApiEnvelope.ok(item));
  }

  @PatchMapping("/items/{ref}")
  public ResponseEntity<ApiEnvelope<CloudItem>> updateItem(
      @PathVariable CloudProvider provider,
      @PathVariable String ref,
      @RequestBody FilesDtos.UpdateItemRequest request
  ) {
    CloudItem item = providerFileService.updateItem(provider, ref, request.name(), request.parentRef());
    return withLocalSyncHeader(ApiEnvelope.ok(item));
  }

  @DeleteMapping("/items/{ref}")
  public ResponseEntity<ApiEnvelope<FilesDtos.DeleteItemResponse>> deleteItem(
      @PathVariable CloudProvider provider,
      @PathVariable String ref
  ) {
    FilesDtos.DeleteItemResponse response = providerFileService.deleteItem(provider, ref);
    return withLocalSyncHeader(ApiEnvelope.ok(response));
  }

  @GetMapping("/items/{ref}/read")
  public ApiEnvelope<FilesDtos.ReadResponse> readItem(
      @PathVariable CloudProvider provider,
      @PathVariable String ref
  ) {
    return ApiEnvelope.ok(providerFileService.readItem(provider, ref));
  }

  @PostMapping("/items/{ref}/ticket")
  public ApiEnvelope<FilesDtos.TicketResponse> createTicket(
      @PathVariable CloudProvider provider,
      @PathVariable String ref,
      @RequestBody FilesDtos.TicketRequest request
  ) {
    return ApiEnvelope.ok(providerFileService.createDownloadTicket(provider, ref, request.disposition()));
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
