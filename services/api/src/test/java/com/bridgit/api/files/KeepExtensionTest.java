package com.bridgit.api.files;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.ItemKind;
import org.junit.jupiter.api.Test;

class KeepExtensionTest {

  private static CloudItem file(String name, String extension) {
    return new CloudItem("ref", "onedrive", name, ItemKind.FILE, null, extension, null, null, null);
  }

  @Test
  void restoresExtensionWhenRenameDropsIt() {
    assertEquals("Relatorio final.docx", ProviderFileService.keepExtension("Relatorio final", file("Relatorio.docx", "docx")));
  }

  @Test
  void keepsExplicitExtensionChange() {
    assertEquals("notas.md", ProviderFileService.keepExtension("notas.md", file("notas.txt", "txt")));
  }

  @Test
  void leavesFoldersAndExtensionlessFilesAlone() {
    CloudItem folder = new CloudItem("ref", "onedrive", "Docs", ItemKind.FOLDER, null, null, null, null, null);
    assertEquals("Documentos", ProviderFileService.keepExtension("Documentos", folder));
    assertEquals("Planilha", ProviderFileService.keepExtension("Planilha", file("Orcamento", null)));
  }
}
