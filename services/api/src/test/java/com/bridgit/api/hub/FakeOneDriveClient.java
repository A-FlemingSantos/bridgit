package com.bridgit.api.hub;

import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClient;
import com.bridgit.api.providers.ContentStream;
import com.bridgit.api.providers.ContentVariant;
import com.bridgit.api.providers.ItemKind;
import com.bridgit.api.providers.ItemPage;
import com.bridgit.api.providers.ReadMode;
import com.bridgit.api.providers.ReadPlan;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;

@Order(Ordered.HIGHEST_PRECEDENCE)
public class FakeOneDriveClient implements CloudProviderClient {

  private final Map<String, CloudItem> items = new HashMap<>();
  private ReadPlan readPlan = new ReadPlan(ReadMode.PDF, ContentVariant.READ, "application/pdf");

  public void putItem(CloudItem item) {
    items.put(item.ref(), item);
  }

  public void removeItem(String ref) {
    items.remove(ref);
  }

  public void setReadPlan(ReadPlan readPlan) {
    this.readPlan = readPlan;
  }

  @Override
  public CloudProvider provider() {
    return CloudProvider.ONEDRIVE;
  }

  @Override
  public ItemPage list(String accessToken, String parentRef, String cursor) {
    return new ItemPage(List.of(), null);
  }

  @Override
  public CloudItem get(String accessToken, String ref) {
    CloudItem item = items.get(ref);
    if (item == null) {
      throw new com.bridgit.api.providers.ProviderApiException(
          org.springframework.http.HttpStatus.NOT_FOUND,
          "ITEM_NAO_ENCONTRADO",
          "Item nao encontrado."
      );
    }
    return item;
  }

  @Override
  public List<CloudItem> ancestry(String accessToken, String ref) {
    return List.of();
  }

  @Override
  public CloudItem createFolder(String accessToken, String parentRef, String name) {
    throw new UnsupportedOperationException();
  }

  @Override
  public CloudItem upload(
      String accessToken,
      String parentRef,
      String name,
      String contentType,
      long size,
      InputStream content
  ) {
    throw new UnsupportedOperationException();
  }

  @Override
  public CloudItem update(String accessToken, String ref, String newName, String newParentRef) {
    throw new UnsupportedOperationException();
  }

  @Override
  public void delete(String accessToken, String ref) {
    items.remove(ref);
  }

  @Override
  public ReadPlan readPlan(CloudItem item) {
    return readPlan;
  }

  @Override
  public ContentStream open(String accessToken, CloudItem item, ContentVariant variant) {
    byte[] bytes = variant == ContentVariant.READ
        ? "read-content".getBytes(StandardCharsets.UTF_8)
        : "original-content".getBytes(StandardCharsets.UTF_8);
    return new ContentStream(
        new ByteArrayInputStream(bytes),
        variant == ContentVariant.READ ? "application/pdf" : item.mimeType(),
        (long) bytes.length,
        item.name()
    );
  }

  @Override
  public List<CloudItem> search(String accessToken, String query, int limit) {
    return List.of();
  }

  public static CloudItem file(String ref, String name, String mimeType, String extension, long size) {
    return new CloudItem(
        ref,
        CloudProvider.ONEDRIVE.id(),
        name,
        ItemKind.FILE,
        mimeType,
        extension,
        size,
        OffsetDateTime.now(),
        null
    );
  }

  public static CloudItem folder(String ref, String name) {
    return new CloudItem(
        ref,
        CloudProvider.ONEDRIVE.id(),
        name,
        ItemKind.FOLDER,
        null,
        null,
        null,
        OffsetDateTime.now(),
        null
    );
  }
}
