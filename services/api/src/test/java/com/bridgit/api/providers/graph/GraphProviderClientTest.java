package com.bridgit.api.providers.graph;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.headerDoesNotExist;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.ContentVariant;
import com.bridgit.api.providers.CursorCodec;
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
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class GraphProviderClientTest {

  private GraphProviderClient client;
  private MockRestServiceServer server;

  @BeforeEach
  void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    RestClient shared = builder.build();
    client = new GraphProviderClient(shared, shared, new ObjectMapper());
  }

  @Test
  void listRootMapsItemsAndCursor() {
    server.expect(requestTo("https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id,name,size,file,folder,lastModifiedDateTime,parentReference&$top=200"))
        .andRespond(withSuccess("""
            {
              "value": [
                {
                  "id": "folder-1",
                  "name": "Alpha",
                  "folder": {},
                  "lastModifiedDateTime": "2026-01-01T00:00:00Z",
                  "parentReference": { "id": "root-id" }
                },
                {
                  "id": "file-1",
                  "name": "readme.txt",
                  "size": 12,
                  "file": { "mimeType": "text/plain" },
                  "lastModifiedDateTime": "2026-01-02T00:00:00Z",
                  "parentReference": { "id": "root-id" }
                }
              ],
              "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/drive/root/children?$skiptoken=abc"
            }
            """, MediaType.APPLICATION_JSON));

    ItemPage page = client.list("token", null, null);

    assertEquals(2, page.items().size());
    assertEquals(ItemKind.FOLDER, page.items().get(0).kind());
    assertEquals("Alpha", page.items().get(0).name());
    assertEquals(ItemKind.FILE, page.items().get(1).kind());
    assertEquals("txt", page.items().get(1).extension());
    assertEquals(
        CursorCodec.encode("https://graph.microsoft.com/v1.0/me/drive/root/children?$skiptoken=abc"),
        page.nextCursor()
    );
    server.verify();
  }

  @Test
  void listUsesDecodedCursorAsNextLink() {
    String nextLink = "https://graph.microsoft.com/v1.0/me/drive/root/children?$skiptoken=abc";
    server.expect(requestTo(nextLink))
        .andRespond(withSuccess("""
            {"value": []}
            """, MediaType.APPLICATION_JSON));

    client.list("token", null, CursorCodec.encode(nextLink));
    server.verify();
  }

  @Test
  void readPlanForDocxUsesPdfRead() {
    CloudItem item = new CloudItem(
        "id",
        "onedrive",
        "report.docx",
        ItemKind.FILE,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "docx",
        100L,
        null,
        null
    );
    ReadPlan plan = client.readPlan(item);
    assertEquals(ReadMode.PDF, plan.mode());
    assertEquals(ContentVariant.READ, plan.variant());
  }

  @Test
  void openOriginalFollowsRedirectWithoutAuthorization() throws Exception {
    server.expect(ExpectedCount.once(), requestTo(org.hamcrest.Matchers.containsString("/items/item-1/content")))
        .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer token"))
        .andRespond(withStatus(HttpStatus.FOUND)
            .header(HttpHeaders.LOCATION, "https://download.example.com/file")
            .body(""));

    server.expect(ExpectedCount.once(), requestTo(org.hamcrest.Matchers.containsString("download.example.com/file")))
        .andExpect(headerDoesNotExist(HttpHeaders.AUTHORIZATION))
        .andRespond(withSuccess("hello", MediaType.TEXT_PLAIN));

    var stream = client.open("token", new CloudItem(
        "item-1", "onedrive", "file.txt", ItemKind.FILE, "text/plain", "txt", 5L, null, null
    ), ContentVariant.ORIGINAL);

    assertEquals('h', (char) stream.body().read());
    stream.close();
    server.verify();
  }

  @Test
  void maps404ToItemNotFound() {
    server.expect(requestTo(org.hamcrest.Matchers.containsString("/me/drive/items/missing")))
        .andRespond(withStatus(HttpStatus.NOT_FOUND).body("{\"error\":{\"code\":\"itemNotFound\"}}"));

    assertThrows(ProviderApiException.class, () -> client.get("token", "missing"));
    server.verify();
  }
}
