package com.bridgit.api.catalog;

import com.bridgit.api.ApiIntegrationTestSupport;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionRepository;
import com.bridgit.api.integrations.ProviderRetryService;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClient;
import com.bridgit.api.providers.CloudProviderClients;
import com.bridgit.api.providers.ItemKind;
import com.bridgit.api.providers.sync.CloudSyncClient;
import com.bridgit.api.providers.sync.SyncPage;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** GET /api/search reads the SQL catalog only (Findings 18): the providers are never called. */
@TestPropertySource(properties = {"app.hub.catalog-enabled=true", "app.hub.operations-enabled=true",
    "app.hub.worker-enabled=false", "app.hub.direct-read-enabled=false"})
class CatalogSearchIntegrationTest extends ApiIntegrationTestSupport {
  @Autowired CatalogStore catalog;
  @Autowired CatalogWorker worker;
  @Autowired ProviderConnectionRepository connections;
  @Autowired JdbcTemplate jdbc;
  @MockitoBean CloudProviderClients clients;
  @MockitoBean ProviderRetryService retry;
  private CloudProviderClient remote;
  private CloudSyncClient feed;
  private ProviderConnectionEntity connection;
  private UUID user;
  private String token;

  @BeforeEach void setup() throws Exception {
    var registered = registerUser("catalog_search", "password123", UUID.randomUUID()).path("data");
    user = UUID.fromString(registered.path("user").path("id").asText());
    token = registered.path("accessToken").asText();
    connection = connect(user, "onedrive", "remote-account");
    remote = mock(CloudProviderClient.class, withSettings().extraInterfaces(CloudSyncClient.class));
    feed = (CloudSyncClient) remote;
    when(remote.provider()).thenReturn(CloudProvider.ONEDRIVE);
    when(clients.get(CloudProvider.ONEDRIVE)).thenReturn(remote);
    when(retry.withRetry(any(), any())).thenAnswer(call -> ((ProviderRetryService.TokenCall<?>) call.getArgument(1)).execute("fixture-token"));
    when(feed.syncPage(any(), any())).thenReturn(new SyncPage(List.of(), "checkpoint-1", true, "root-id"));
    catalog.ensure(connection);
  }

  private ProviderConnectionEntity connect(UUID owner, String provider, String account) {
    ProviderConnectionEntity entity = new ProviderConnectionEntity();
    entity.setUserId(owner); entity.setProvider(provider); entity.setAccountId(account);
    entity.setEncryptedRefreshToken("unused"); entity.setConnectedAt(OffsetDateTime.now());
    return connections.saveAndFlush(entity);
  }

  private static CloudItem file(String ref, String name, String parent, boolean parentKnown) {
    return new CloudItem(ref, "onedrive", name, ItemKind.FILE, "text/plain", "txt", 8L, OffsetDateTime.now(), parent, parentKnown, "etag", "content");
  }

  private static CloudItem folder(String ref, String name) {
    return new CloudItem(ref, "onedrive", name, ItemKind.FOLDER, null, null, null, OffsetDateTime.now(), null, true, "etag", null);
  }

  private void catalogHas(ProviderConnectionEntity c, CloudItem... items) {
    catalog.remember(c, List.of(items), null, true);
  }

  private JsonNode search(String term) throws Exception {
    return readJson(mockMvc.perform(get("/api/search").param("q", term).header("Authorization", "Bearer " + token))
        .andExpect(status().isOk()).andReturn()).path("data");
  }

  private static List<String> refs(JsonNode data) {
    List<String> refs = new ArrayList<>();
    data.path("results").forEach(result -> refs.add(result.path("ref").asText()));
    return refs;
  }

  @Test void matchesAnywhereInTheNameAndNeverCallsTheProvider() throws Exception {
    catalogHas(connection, file("a", "Relatorio anual.pdf", null, true), file("b", "Meu relatorio final.txt", "folder-1", true),
        folder("c", "Todos os relatorios"), file("d", "Contrato.txt", null, true));

    JsonNode data = search("latorio");

    assertThat(refs(data)).containsExactlyInAnyOrder("a", "b", "c");
    assertThat(data.path("results").get(0).path("connectionId").asText()).isEqualTo(connection.getId().toString());
    assertThat(data.path("providers")).hasSize(1);
    JsonNode status = data.path("providers").get(0);
    assertThat(status.path("id").asText()).isEqualTo("onedrive");
    assertThat(status.path("ok").asBoolean()).isTrue();
    assertThat(status.path("error").isNull() || status.path("error").isMissingNode()).isTrue();
    assertThat(status.path("connectionId").asText()).isEqualTo(connection.getId().toString());
    verify(remote, never()).list(any(), any(), any());
    verify(remote, never()).get(any(), any());
    verifyNoInteractions(retry);
  }

  @Test void resultsAreSortedByNameIgnoringCase() throws Exception {
    catalogHas(connection, file("z", "zeta nota.txt", null, true), file("a", "Alfa nota.txt", null, true), file("m", "meio nota.txt", null, true));

    assertThat(refs(search("nota"))).containsExactly("a", "m", "z");
  }

  @Test void ignoresCaseAndAccents() throws Exception {
    catalogHas(connection, file("a", "Relatório Anual.pdf", null, true), file("b", "relatorio final.txt", null, true),
        file("c", "CAFÉ da manhã.txt", null, true));

    assertThat(refs(search("RELATORIO"))).containsExactlyInAnyOrder("a", "b");
    assertThat(refs(search("relatório"))).containsExactlyInAnyOrder("a", "b");
    assertThat(refs(search("cafe"))).containsExactly("c");
    assertThat(refs(search("MANHA"))).containsExactly("c");
  }

  @Test void percentAndUnderscoreAreLiteral() throws Exception {
    catalogHas(connection, file("a", "100% pronto.txt", null, true), file("b", "100x pronto.txt", null, true),
        file("c", "nota_final.txt", null, true), file("d", "notaXfinal.txt", null, true), file("e", "tabela[1].txt", null, true),
        file("f", "tabela1.txt", null, true), file("g", "pasta\\dados.txt", null, true));

    assertThat(refs(search("0% "))).containsExactly("a");
    assertThat(refs(search("a_f"))).containsExactly("c");
    assertThat(refs(search("a[1"))).containsExactly("e");
    assertThat(refs(search("ta\\da"))).containsExactly("g");
  }

  @Test void leavesOutDeletedRowsOtherScansOtherGenerationsAndRootRowsWithUnknownParent() throws Exception {
    catalogHas(connection, file("keep", "relatorio visivel.txt", null, true), file("gone", "relatorio apagado.txt", null, true),
        file("orphan", "relatorio sem pai.txt", null, false), file("child", "relatorio na pasta.txt", "folder-1", false));
    catalog.confirmed(connection, null, "gone");
    long scan = catalog.state(connection.getId()).activeScan();
    insertRaw(scan + 1, connection.getGeneration(), "other-scan", "relatorio de outra varredura.txt");
    insertRaw(scan, connection.getGeneration() + 1, "other-generation", "relatorio de outra geracao.txt");

    JsonNode data = search("relatorio");

    // A row with a parent ref is kept even when the flag is unset; a root row is kept only when the root is known.
    assertThat(refs(data)).containsExactlyInAnyOrder("keep", "child");
  }

  private void insertRaw(long scan, long generation, String ref, String name) throws Exception {
    String itemJson = objectMapper.writeValueAsString(file(ref, name, null, true));
    jdbc.update("INSERT INTO cloud_catalog_items(connection_id,generation,scan_id,item_ref,parent_ref,item_name,kind,item_json,mutation_fence,deleted) VALUES(?,?,?,?,NULL,?,'file',?,0,0)",
        connection.getId().toString(), generation, scan, ref, name, itemJson);
  }

  @Test void coverageIsPartialUntilTheCatalogIsComplete() throws Exception {
    catalogHas(connection, file("a", "relatorio.txt", null, true));

    JsonNode before = search("relatorio").path("providers").get(0).path("catalog");
    assertThat(before.path("coverage").asText()).isEqualTo("partial");
    assertThat(before.path("connectionId").asText()).isEqualTo(connection.getId().toString());

    catalog.schedule(connection.getId());
    worker.sync(connection);

    JsonNode data = search("relatorio");
    assertThat(refs(data)).containsExactly("a");
    JsonNode after = data.path("providers").get(0).path("catalog");
    assertThat(after.path("coverage").asText()).isEqualTo("complete");
    assertThat(after.path("freshness").asText()).isEqualTo("current");
    assertThat(after.hasNonNull("syncedAt")).isTrue();
  }

  @Test void shortTermsAreRefused() throws Exception {
    mockMvc.perform(get("/api/search").param("q", " a ").header("Authorization", "Bearer " + token))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("BUSCA_CURTA"));
    mockMvc.perform(get("/api/search").param("q", "").header("Authorization", "Bearer " + token))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("BUSCA_CURTA"));
  }

  @Test void anotherUsersConnectionIsNotSearched() throws Exception {
    UUID other = UUID.fromString(registerUser("catalog_search_other", "password123", UUID.randomUUID()).path("data").path("user").path("id").asText());
    ProviderConnectionEntity theirs = connect(other, "onedrive", "other-account");
    catalogHas(theirs, file("theirs", "relatorio secreto.txt", null, true));
    catalogHas(connection, file("mine", "relatorio meu.txt", null, true));

    JsonNode data = search("relatorio");

    assertThat(refs(data)).containsExactly("mine");
    assertThat(data.path("providers")).hasSize(1);
    assertThat(data.path("providers").get(0).path("connectionId").asText()).isEqualTo(connection.getId().toString());
  }

  @Test void aConnectionWithoutACatalogIsReportedAndNotSearchedAtTheProvider() throws Exception {
    ProviderConnectionEntity dropbox = connect(user, "dropbox", "dropbox-account");
    CloudProviderClient plain = mock(CloudProviderClient.class);
    when(plain.provider()).thenReturn(CloudProvider.DROPBOX);
    when(clients.get(CloudProvider.DROPBOX)).thenReturn(plain);
    catalogHas(connection, file("a", "relatorio.txt", null, true));

    JsonNode data = search("relatorio");

    assertThat(refs(data)).containsExactly("a");
    assertThat(data.path("providers")).hasSize(2);
    JsonNode ok = data.path("providers").get(0);
    JsonNode unavailable = data.path("providers").get(1);
    assertThat(ok.path("connectionId").asText()).isEqualTo(connection.getId().toString());
    assertThat(ok.path("ok").asBoolean()).isTrue();
    assertThat(unavailable.path("id").asText()).isEqualTo("dropbox");
    assertThat(unavailable.path("connectionId").asText()).isEqualTo(dropbox.getId().toString());
    assertThat(unavailable.path("ok").asBoolean()).isFalse();
    assertThat(unavailable.path("error").asText()).isEqualTo("CATALOGO_INDISPONIVEL");
    assertThat(unavailable.path("catalog").isNull() || unavailable.path("catalog").isMissingNode()).isTrue();
    verifyNoInteractions(retry);
  }
}
