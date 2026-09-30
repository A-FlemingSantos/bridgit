package com.bridgit.api.catalog;

import com.bridgit.api.common.error.ApiException;
import com.bridgit.api.files.ContentTicketService;
import com.bridgit.api.files.FilesDtos;
import com.bridgit.api.integrations.*;
import com.bridgit.api.providers.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class ReadAuthorizationService {
  private record Key(UUID connection, long generation, String ref) {}
  private record Validated(CloudItem item, Instant until, String directUrl) {}
  private final ConcurrentHashMap<Key, Validated> cache = new ConcurrentHashMap<>();
  private final Object[] locks = java.util.stream.Stream.generate(Object::new).limit(64).toArray();
  private final ProviderRetryService retry;
  private final CatalogStore catalog;
  private final ContentTicketService tickets;
  private final LocalHubProperties properties;
  private final Clock clock;
  public ReadAuthorizationService(ProviderRetryService retry, CatalogStore catalog, ContentTicketService tickets,
      LocalHubProperties properties, Clock clock) {
    this.retry = retry; this.catalog = catalog; this.tickets = tickets; this.properties = properties; this.clock = clock;
  }
  public FilesDtos.ReadResponse describe(ProviderConnectionEntity c, CloudProviderClient client, String ref) {
    Validated valid = validate(c, client, ref);
    CloudItem item = valid.item();
    ReadPlan plan = client.readPlan(item);
    if (plan.mode() == ReadMode.NONE) return new FilesDtos.ReadResponse(ReadMode.NONE, null, null);
    ContentTicketService.IssuedTicket ticket = tickets.createTicket(c.getUserId(), c.getId(), ref, plan.variant(), "inline", c.getGeneration(), item.contentRevision());
    String proxy = "/api/content/" + ticket.ticket();
    if (!properties.isContentCacheEnabled() || !properties.providerEnabled(c.getProvider())) return new FilesDtos.ReadResponse(plan.mode(), proxy, ticket.expiresAt());
    String direct = plan.variant() == ContentVariant.ORIGINAL ? valid.directUrl() : null;
    return new FilesDtos.ReadResponse(plan.mode(), direct == null ? proxy : direct, ticket.expiresAt(), c.getId(), c.getGeneration(), ref,
        item.contentRevision(), plan.variant().name(), OffsetDateTime.ofInstant(valid.until(), ZoneOffset.UTC),
        plan.variant() == ContentVariant.ORIGINAL ? item.size() : null, proxy);
  }
  public void invalidate(UUID connection, String ref) {
    cache.keySet().removeIf(key -> key.connection().equals(connection) && key.ref().equals(ref));
  }
  public ContentStream open(ProviderConnectionEntity c, CloudProviderClient client, ContentTicketService.ContentTicket ticket, String rangeHeader) {
    if (!Objects.equals(ticket.generation(), c.getGeneration())) throw new ApiException(HttpStatus.GONE, "CONTEUDO_EXPIRADO", "A conexao foi alterada. Abra o arquivo novamente.");
    CloudItem item = validate(c, client, ticket.ref()).item();
    if (ticket.revision() != null && !Objects.equals(ticket.revision(), item.contentRevision())) throw new ApiException(HttpStatus.CONFLICT, "CONTEUDO_ALTERADO", "O conteudo foi atualizado. Abra o arquivo novamente.");
    ContentRange range = ticket.variant() == ContentVariant.ORIGINAL && rangeHeader != null ? ContentRange.parseSingle(rangeHeader, item.size()) : null;
    return retry.withRetry(c, token -> range == null ? client.open(token, item, ticket.variant()) : client.open(token, item, ticket.variant(), range));
  }
  private Validated validate(ProviderConnectionEntity c, CloudProviderClient client, String ref) {
    Key key = new Key(c.getId(), c.getGeneration(), ref);
    synchronized (locks[Math.floorMod(key.hashCode(), locks.length)]) {
      Validated old = cache.get(key);
      CatalogStore.Entry known = catalog.entry(c, ref);
      if (old != null && old.until().isAfter(clock.instant()) && (known == null || !known.deleted()
          && Objects.equals(known.item().contentRevision(), old.item().contentRevision()))) return old;
      try {
        CloudItem item = retry.withRetry(c, token -> client.get(token, ref));
        catalog.rememberItem(c, item);
        String direct = properties.isDirectReadEnabled() ? retry.withRetry(c, token -> client.directReadUrl(token, ref)) : null;
        Validated valid = new Validated(item, clock.instant().plusSeconds(60), direct);
        cache.put(key, valid);
        if (cache.size() > 10000) cache.entrySet().removeIf(e -> e.getValue().until().isBefore(clock.instant()));
        return valid;
      } catch (RuntimeException ex) { cache.remove(key); throw ex; }
    }
  }
}
