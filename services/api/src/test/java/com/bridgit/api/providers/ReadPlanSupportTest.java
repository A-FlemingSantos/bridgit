package com.bridgit.api.providers;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

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
