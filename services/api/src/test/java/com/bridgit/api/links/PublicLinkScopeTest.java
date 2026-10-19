package com.bridgit.api.links;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.bridgit.api.catalog.CatalogService;
import com.bridgit.api.catalog.CatalogStore;
import com.bridgit.api.common.error.NotFoundException;
import com.bridgit.api.files.FilesDtos.FolderRef;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderRetryService;
import com.bridgit.api.links.PublicFolderDtos.PublicCrumb;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClient;
import com.bridgit.api.providers.ItemKind;
import com.bridgit.api.providers.ProviderApiException;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class PublicLinkScopeTest {

  private ProviderRetryService retryService;
  private CatalogService catalog;
  private CatalogStore catalogStore;
  private CloudProviderClient client;
  private ProviderConnectionEntity connection;
  private ResolvedPublicLink ctx;
  private PublicLinkScope scope;

  @BeforeEach
  void setUp() {
    retryService = mock(ProviderRetryService.class);
    catalog = mock(CatalogService.class);
    catalogStore = mock(CatalogStore.class);
    client = mock(CloudProviderClient.class);
    connection = new ProviderConnectionEntity();
    when(retryService.withRetry(any(), any())).thenAnswer(invocation ->
        invocation.<ProviderRetryService.TokenCall<?>>getArgument(1).execute("token"));
    when(catalog.enabled(client)).thenReturn(false);

    ctx = new ResolvedPublicLink(
        new PublicLinkEntity(), connection, CloudProvider.ONEDRIVE, client, folder("root", "Shared", null, true));
    scope = new PublicLinkScope(retryService, catalog, catalogStore);
  }

  @Test
  void theSharedFolderItselfIsInsideWithoutAnyLookup() {
    assertThat(scope.requireInside(ctx, ctx.root())).isEmpty();

    verifyNoInteractions(client, catalogStore);
  }

  @Test
  void aDirectChildIsInsideWithoutAnyProviderCall() {
    CloudItem child = folder("child", "Child", "root", true);
    when(catalog.enabled(client)).thenReturn(true);

    assertThat(scope.requireInside(ctx, child)).isEmpty();

    verifyNoInteractions(client, catalogStore);
  }

  @Test
  void aCatalogChainThatReachesTheSharedFolderAnswersWithoutTheProvider() {
    CloudItem item = file("item", "Item", "deep", true);
    when(catalog.enabled(client)).thenReturn(true);
    when(catalogStore.ancestry(connection, item)).thenReturn(List.of(
        new FolderRef("root", "Shared"), new FolderRef("mid", "Mid"), new FolderRef("deep", "Deep")));

    assertThat(scope.requireInside(ctx, item))
        .containsExactly(new PublicCrumb("mid", "Mid"), new PublicCrumb("deep", "Deep"));

    verify(client, never()).ancestry(anyString(), anyString());
  }

  @Test
  void aTruncatedCatalogChainFallsThroughToTheProvider() {
    CloudItem item = file("item", "Item", "deep", true);
    when(catalog.enabled(client)).thenReturn(true);
    when(catalogStore.ancestry(connection, item)).thenReturn(List.of(new FolderRef("deep", "Deep")));
    when(client.ancestry("token", "item")).thenReturn(List.of(
        folder("root", "Shared", null, true), folder("mid", "Mid", "root", true), folder("deep", "Deep", "mid", true)));

    assertThat(scope.requireInside(ctx, item))
        .containsExactly(new PublicCrumb("mid", "Mid"), new PublicCrumb("deep", "Deep"));

    verify(client).ancestry("token", "item");
  }

  @Test
  void theProviderChainIsUsedWhenTheCatalogIsOff() {
    CloudItem item = file("item", "Item", "mid", true);
    when(client.ancestry("token", "item")).thenReturn(List.of(
        folder("root", "Shared", null, true), folder("mid", "Mid", "root", true)));

    assertThat(scope.requireInside(ctx, item)).containsExactly(new PublicCrumb("mid", "Mid"));

    verifyNoInteractions(catalogStore);
  }

  @Test
  void anEmptyAncestryIsDenied() {
    CloudItem item = file("item", "Item", "elsewhere", true);
    when(client.ancestry("token", "item")).thenReturn(List.of());

    assertThatThrownBy(() -> scope.requireInside(ctx, item)).isInstanceOfSatisfying(
        NotFoundException.class, ex -> assertThat(ex.getCode()).isEqualTo("LINK_ITEM_NAO_ENCONTRADO"));
  }

  @Test
  void anAncestryWithoutTheSharedFolderIsDenied() {
    CloudItem item = file("item", "Item", "other", true);
    when(client.ancestry("token", "item")).thenReturn(List.of(
        folder("top", "Top", null, true), folder("other", "Other", "top", true)));

    assertThatThrownBy(() -> scope.requireInside(ctx, item)).isInstanceOfSatisfying(
        NotFoundException.class, ex -> assertThat(ex.getCode()).isEqualTo("LINK_ITEM_NAO_ENCONTRADO"));
  }

  @Test
  void anItemWhoseParentIsUnknownIsDeniedAndTheCatalogIsNotAsked() {
    CloudItem item = file("item", "Item", null, false);
    when(catalog.enabled(client)).thenReturn(true);
    when(client.ancestry("token", "item")).thenReturn(List.of());

    assertThatThrownBy(() -> scope.requireInside(ctx, item)).isInstanceOfSatisfying(
        NotFoundException.class, ex -> assertThat(ex.getCode()).isEqualTo("LINK_ITEM_NAO_ENCONTRADO"));

    verify(catalogStore, never()).ancestry(any(), any());
  }

  @Test
  void aTransientProviderFailureIsNotMistakenForAnOutsideItem() {
    CloudItem item = file("item", "Item", "elsewhere", true);
    when(client.ancestry(eq("token"), eq("item")))
        .thenThrow(new ProviderApiException(HttpStatus.SERVICE_UNAVAILABLE, "PROVEDOR_INDISPONIVEL", "down"));

    assertThatThrownBy(() -> scope.requireInside(ctx, item)).isInstanceOf(LinkUnavailableException.class);
  }

  private static CloudItem folder(String ref, String name, String parentRef, boolean parentKnown) {
    return new CloudItem(ref, "onedrive", name, ItemKind.FOLDER, null, null, null, OffsetDateTime.now(),
        parentRef, parentKnown);
  }

  private static CloudItem file(String ref, String name, String parentRef, boolean parentKnown) {
    return new CloudItem(ref, "onedrive", name, ItemKind.FILE, "text/plain", "txt", 4L, OffsetDateTime.now(),
        parentRef, parentKnown);
  }
}
