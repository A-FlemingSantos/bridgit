package com.bridgit.api.providers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class ReadPlanSupportTest {

  @Test
  void imageUsesOriginalVariant() {
    CloudItem item = file("photo.png", "image/png", 1000L);
    ReadPlan plan = ReadPlanSupport.readPlan(CloudProvider.ONEDRIVE, item);
    assertEquals(ReadMode.IMAGE, plan.mode());
    assertEquals(ContentVariant.ORIGINAL, plan.variant());
  }

  @Test
  void pdfUsesOriginalVariant() {
    CloudItem item = file("doc.pdf", "application/pdf", 1000L);
    ReadPlan plan = ReadPlanSupport.readPlan(CloudProvider.GOOGLE_DRIVE, item);
    assertEquals(ReadMode.PDF, plan.mode());
    assertEquals(ContentVariant.ORIGINAL, plan.variant());
  }

  @Test
  void smallTextUsesTextMode() {
    CloudItem item = file("readme.md", "text/markdown", 1024L);
    ReadPlan plan = ReadPlanSupport.readPlan(CloudProvider.DROPBOX, item);
    assertEquals(ReadMode.TEXT, plan.mode());
    assertEquals(ContentVariant.ORIGINAL, plan.variant());
  }

  @Test
  void largeTextUsesNone() {
    CloudItem item = file("big.log", "text/plain", 3L * 1024L * 1024L);
    ReadPlan plan = ReadPlanSupport.readPlan(CloudProvider.ONEDRIVE, item);
    assertEquals(ReadMode.NONE, plan.mode());
  }

  @Test
  void markdownExtensionUsesTextModeWithoutTextMime() {
    CloudItem item = file("notas.markdown", "application/octet-stream", 1024L);
    assertEquals(ReadMode.TEXT, ReadPlanSupport.readPlan(CloudProvider.ONEDRIVE, item).mode());
    assertTrue(ReadPlanSupport.isEditableText(CloudProvider.ONEDRIVE, item.withVersions("v1", "c1")));
  }

  @Test
  void onedriveDocxUsesReadPdf() {
    CloudItem item = file(
        "report.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        1000L
    );
    ReadPlan plan = ReadPlanSupport.readPlan(CloudProvider.ONEDRIVE, item);
    assertEquals(ReadMode.PDF, plan.mode());
    assertEquals(ContentVariant.READ, plan.variant());
  }

  @Test
  void googleNativeDocUsesReadPdf() {
    CloudItem item = file(
        "Notes",
        "application/vnd.google-apps.document",
        null
    );
    ReadPlan plan = ReadPlanSupport.readPlan(CloudProvider.GOOGLE_DRIVE, item);
    assertEquals(ReadMode.PDF, plan.mode());
    assertEquals(ContentVariant.READ, plan.variant());
  }

  @ParameterizedTest
  @CsvSource({
      "Atalho, application/vnd.google-apps.shortcut",
      "Atalho.pdf, application/vnd.google-apps.shortcut",
      "Atalho.txt, application/vnd.google-apps.shortcut",
      "Formulário, application/vnd.google-apps.form",
      "Formulário.pdf, application/vnd.google-apps.form",
      "Site, application/vnd.google-apps.site",
      "Mapa.txt, application/vnd.google-apps.map"
  })
  void googleNativeWithoutExportUsesNone(String name, String mime) {
    ReadPlan plan = ReadPlanSupport.readPlan(CloudProvider.GOOGLE_DRIVE, file(name, mime, null));
    assertEquals(ReadMode.NONE, plan.mode());
    assertEquals(ContentVariant.ORIGINAL, plan.variant());
    assertNull(plan.contentType());
  }

  @Test
  void googleNativeDocNamedLikePdfStillUsesReadPdf() {
    CloudItem item = file("Relatório.pdf", "application/vnd.google-apps.document", null);
    ReadPlan plan = ReadPlanSupport.readPlan(CloudProvider.GOOGLE_DRIVE, item);
    assertEquals(ReadMode.PDF, plan.mode());
    assertEquals(ContentVariant.READ, plan.variant());
  }

  @Test
  void dropboxDocxUsesReadPdf() {
    CloudItem item = file("file.docx", "application/octet-stream", 1000L);
    ReadPlan plan = ReadPlanSupport.readPlan(CloudProvider.DROPBOX, item);
    assertEquals(ReadMode.PDF, plan.mode());
    assertEquals(ContentVariant.READ, plan.variant());
  }

  @Test
  void unknownBinaryUsesNone() {
    CloudItem item = file("archive.zip", "application/zip", 1000L);
    ReadPlan plan = ReadPlanSupport.readPlan(CloudProvider.ONEDRIVE, item);
    assertEquals(ReadMode.NONE, plan.mode());
  }

  @Test
  void smallTextWithRevisionIsEditable() {
    CloudItem item = file("readme.md", "text/markdown", 1024L).withVersions("v1", "c1");
    assertTrue(ReadPlanSupport.isEditableText(CloudProvider.DROPBOX, item));
    assertTrue(ReadPlanSupport.isEditableText(CloudProvider.ONEDRIVE,
        file("a.txt", "text/plain", ReadPlanSupport.EDIT_MAX_BYTES).withVersions("v1", "c1")));
  }

  @Test
  void editableNeedsSizeWithinLimitAndRevision() {
    assertFalse(ReadPlanSupport.isEditableText(CloudProvider.ONEDRIVE, file("a.txt", "text/plain", 10L)));
    assertFalse(ReadPlanSupport.isEditableText(CloudProvider.ONEDRIVE,
        file("a.txt", "text/plain", 10L).withVersions("v1", " ")));
    assertFalse(ReadPlanSupport.isEditableText(CloudProvider.ONEDRIVE,
        file("a.txt", "text/plain", null).withVersions("v1", "c1")));
    assertFalse(ReadPlanSupport.isEditableText(CloudProvider.ONEDRIVE,
        file("a.txt", "text/plain", ReadPlanSupport.EDIT_MAX_BYTES + 1).withVersions("v1", "c1")));
  }

  @Test
  void nonTextAndGoogleNativeAreNotEditable() {
    assertFalse(ReadPlanSupport.isEditableText(CloudProvider.ONEDRIVE,
        file("photo.png", "image/png", 10L).withVersions("v1", "c1")));
    assertFalse(ReadPlanSupport.isEditableText(CloudProvider.GOOGLE_DRIVE,
        file("doc", "application/vnd.google-apps.document", null).withVersions("v1", "c1")));
  }

  private static CloudItem file(String name, String mime, Long size) {
    return new CloudItem(
        "ref-1",
        CloudProvider.ONEDRIVE.id(),
        name,
        ItemKind.FILE,
        mime,
        CloudItemSupport.extensionFromName(name),
        size,
        OffsetDateTime.now(),
        null
    );
  }
}
