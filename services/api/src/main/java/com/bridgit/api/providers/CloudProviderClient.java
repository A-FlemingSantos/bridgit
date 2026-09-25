package com.bridgit.api.providers;

import java.io.InputStream;
import java.util.List;

public interface CloudProviderClient {

  CloudProvider provider();

  ItemPage list(String accessToken, String parentRef, String cursor);

  CloudItem get(String accessToken, String ref);

  List<CloudItem> ancestry(String accessToken, String ref);

  CloudItem createFolder(String accessToken, String parentRef, String name);

  CloudItem upload(
      String accessToken,
      String parentRef,
      String name,
      String contentType,
      long size,
      InputStream content
  );

  CloudItem update(String accessToken, String ref, String newName, String newParentRef);

  void delete(String accessToken, String ref);

  ReadPlan readPlan(CloudItem item);

  ContentStream open(String accessToken, CloudItem item, ContentVariant variant);

  List<CloudItem> search(String accessToken, String query, int limit);
}
