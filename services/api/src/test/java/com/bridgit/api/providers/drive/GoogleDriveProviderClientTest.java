package com.bridgit.api.providers.drive;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.ContentStream;
import com.bridgit.api.providers.ContentVariant;
import com.bridgit.api.providers.ItemKind;
import com.bridgit.api.providers.ItemPage;
import com.bridgit.api.providers.ProviderApiException;
import com.bridgit.api.providers.ReadMode;
import com.bridgit.api.providers.ReadPlan;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class GoogleDriveProviderClientTest {

  private GoogleDriveProviderClient client;
  private MockRestServiceServer server;

  @BeforeEach
  void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    client = new GoogleDriveProviderClient(builder.build(), new ObjectMapper());
  }

  @Test
  void listResolvesRootAndMapsCursor() {
    server.expect(requestTo("https://www.googleapis.com/drive/v3/files/root?fields=id"))
        .andRespond(withSuccess("{\"id\":\"root-id\"}", MediaType.APPLICATION_JSON));

    server.expect(requestTo(org.hamcrest.Matchers.allOf(
            org.hamcrest.Matchers.containsString("/drive/v3/files?q=%27root-id%27"),
            org.hamcrest.Matchers.containsString("fields=nextPageToken%2CincompleteSearch%2Cfiles%28"),
            org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("%25")))))
        .andRespond(withSuccess("""
            {
              "nextPageToken": "token-2",
              "files": [
                {
                  "id": "folder-1",
                  "name": "Docs",
                  "mimeType": "application/vnd.google-apps.folder",
                  "modifiedTime": "2026-01-01T00:00:00Z",
                  "parents": ["root-id"]
                }
              ]
            }
            """, MediaType.APPLICATION_JSON));

    ItemPage page = client.list("token", null, null);

    assertEquals(1, page.items().size());
    assertEquals(ItemKind.FOLDER, page.items().get(0).kind());
    assertEquals("token-2", page.nextCursor());
    server.verify();
  }

  @Test
  void readPlanForGoogleDocUsesPdfRead() {
    var item = new com.bridgit.api.providers.CloudItem(
        "id",
        "google-drive",
        "Notes",
        ItemKind.FILE,
        "application/vnd.google-apps.document",
        null,
        null,
        null,
        null
    );
    ReadPlan plan = client.readPlan(item);
    assertEquals(ReadMode.PDF, plan.mode());
    assertEquals(ContentVariant.READ, plan.variant());
  }

  @Test
  void thumbnailDownloadsTheLinkWithTheToken() throws Exception {
    server.expect(requestTo(org.hamcrest.Matchers.containsString("fields=thumbnailLink")))
        .andRespond(withSuccess("{\"thumbnailLink\":\"https://lh3.googleusercontent.com/thumb=s220\"}", MediaType.APPLICATION_JSON));
    server.expect(requestTo("https://lh3.googleusercontent.com/thumb=s640"))
        .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer token"))
        .andRespond(withSuccess(new byte[] {1, 2}, MediaType.IMAGE_JPEG));

    ContentStream stream = client.openThumbnail("token", new CloudItem(
        "file-1", "google-drive", "photo.jpg", ItemKind.FILE, "image/jpeg", "jpg", 4L, null, null
    ));

    assertEquals(1, stream.body().read());
    stream.close();
    server.verify();
  }

  @Test
  void missingThumbnailLinkIsNotFound() {
    server.expect(requestTo(org.hamcrest.Matchers.containsString("fields=thumbnailLink")))
        .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

    ProviderApiException error = assertThrows(ProviderApiException.class, () -> client.openThumbnail("token", new CloudItem(
        "file-1", "google-drive", "photo.jpg", ItemKind.FILE, "image/jpeg", "jpg", 4L, null, null
    )));

    assertEquals(HttpStatus.NOT_FOUND, error.getStatus());
    server.verify();
  }
}
