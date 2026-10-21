package com.bridgit.api.providers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class ThumbnailSupportTest {

  @Test
  void plainTextIsEligibleWhereTheCloudDrawsIt() {
    assertTrue(ThumbnailSupport.eligible(CloudProvider.ONEDRIVE, file("note.txt", "text/plain", "txt", 12L)));
    assertTrue(ThumbnailSupport.eligible(CloudProvider.ONEDRIVE, file("readme.md", "text/markdown", "md", 12L)));
    assertTrue(ThumbnailSupport.eligible(CloudProvider.GOOGLE_DRIVE, file("note.txt", "text/plain", "txt", 12L)));
    assertFalse(ThumbnailSupport.eligible(CloudProvider.GOOGLE_DRIVE, file("readme.md", "text/markdown", "md", 12L)));
    assertFalse(ThumbnailSupport.eligible(CloudProvider.DROPBOX, file("note.txt", "text/plain", "txt", 12L)));
  }

  @Test
  void imagesPdfAndOfficeAreEligibleOnOneDriveAndDrive() {
    assertTrue(ThumbnailSupport.eligible(CloudProvider.ONEDRIVE, file("a.jpg", "image/jpeg", "jpg", 10L)));
    assertTrue(ThumbnailSupport.eligible(CloudProvider.GOOGLE_DRIVE, file("a.pdf", "application/pdf", "pdf", 10L)));
    assertTrue(ThumbnailSupport.eligible(CloudProvider.ONEDRIVE, file("a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx", 10L)));
    assertTrue(ThumbnailSupport.eligible(CloudProvider.GOOGLE_DRIVE, file("Planilha", "application/vnd.google-apps.spreadsheet", null, null)));
  }

  @Test
  void csvAndDrawingsAreNotEligible() {
    assertFalse(ThumbnailSupport.eligible(CloudProvider.ONEDRIVE, file("a.csv", "text/csv", "csv", 10L)));
    assertFalse(ThumbnailSupport.eligible(CloudProvider.GOOGLE_DRIVE, file("Desenho", "application/vnd.google-apps.drawing", null, null)));
  }

  @Test
  void dropboxThumbnailsImagesOnlyAndSkipsOversizedPhotos() {
    assertTrue(ThumbnailSupport.eligible(CloudProvider.DROPBOX, file("a.png", "image/png", "png", 10L)));
    assertTrue(ThumbnailSupport.eligible(CloudProvider.DROPBOX, file("a.jpg", "image/jpeg", "jpg", null)));
    assertFalse(ThumbnailSupport.eligible(CloudProvider.DROPBOX, file("a.pdf", "application/pdf", "pdf", 10L)));
    assertFalse(ThumbnailSupport.eligible(CloudProvider.DROPBOX, file("a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx", 10L)));
    assertFalse(ThumbnailSupport.eligible(CloudProvider.DROPBOX, file("big.jpg", "image/jpeg", "jpg", ThumbnailSupport.DROPBOX_MAX_BYTES + 1)));
  }

  @Test
  void imageContentTypeKeepsImageMediaTypes() {
    assertEquals("image/png", ThumbnailSupport.imageContentType("image/png; charset=binary"));
    assertEquals("image/jpeg", ThumbnailSupport.imageContentType("application/octet-stream"));
    assertEquals("image/jpeg", ThumbnailSupport.imageContentType(null));
  }

  private static CloudItem file(String name, String mime, String extension, Long size) {
    return new CloudItem("ref", "provider", name, ItemKind.FILE, mime, extension, size, null, null);
  }
}
