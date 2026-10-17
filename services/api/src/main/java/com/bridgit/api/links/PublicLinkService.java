package com.bridgit.api.links;

import com.bridgit.api.common.error.ApiException;
import com.bridgit.api.common.error.BadRequestException;
import com.bridgit.api.common.error.NotFoundException;
import com.bridgit.api.common.error.TooManyRequestsException;
import com.bridgit.api.common.security.AuthenticatedUserService;
import com.bridgit.api.common.security.RateLimiter;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionRepository;
import com.bridgit.api.integrations.ProviderConnectionService;
import com.bridgit.api.integrations.ProviderRetryService;
import com.bridgit.api.links.LinkDtos.OwnerPublicLinkResponse;
import com.bridgit.api.links.LinkDtos.OwnerPublicLinkSummary;
import com.bridgit.api.links.LinkDtos.PublicLinkMetadata;
import com.bridgit.api.providers.CloudItem;
import com.bridgit.api.providers.CloudProvider;
import com.bridgit.api.providers.CloudProviderClient;
import com.bridgit.api.providers.CloudProviderClients;
import com.bridgit.api.providers.ContentRange;
import com.bridgit.api.providers.ContentStream;
import com.bridgit.api.providers.ContentStreamResponder;
import com.bridgit.api.providers.ContentVariant;
import com.bridgit.api.providers.ItemKind;
import com.bridgit.api.providers.ProviderApiException;
import com.bridgit.api.providers.ReadMode;
import com.bridgit.api.providers.ReadPlan;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

@Service
public class PublicLinkService {

  private static final String LINK_NOT_FOUND_CODE = "LINK_NAO_ENCONTRADO";
  private static final String LINK_NOT_FOUND_MESSAGE = "Este link público não está disponível.";
  private static final String LINK_UNAVAILABLE_MESSAGE = "O arquivo não está disponível agora. Tente de novo em instantes.";
  private static final String TOO_MANY_ACCESSES_CODE = "MUITOS_ACESSOS";
  private static final String TOO_MANY_ACCESSES_MESSAGE = "Muitos acessos a este link. Tente de novo em instantes.";
  private static final int SUFFIX_COLLISION_RETRIES = 8;
  private static final Duration ACCESS_WINDOW = Duration.ofMinutes(1);
  // Visits and range requests would otherwise rewrite the row every time; a minute of resolution is plenty.
  private static final Duration LAST_ACCESS_RESOLUTION = Duration.ofMinutes(1);
  private static final Logger logger = LoggerFactory.getLogger(PublicLinkService.class);

  private final PublicLinkRepository linkRepository;
  private final ProviderConnectionRepository connectionRepository;
  private final ProviderConnectionService connectionService;
  private final ProviderRetryService retryService;
  private final CloudProviderClients providerClients;
  private final AuthenticatedUserService authenticatedUserService;
  private final ContentStreamResponder contentStreamResponder;
  private final TransactionTemplate shortTemplate;
  private final TransactionTemplate requiresNewTemplate;
  private final Clock clock;
  private final RateLimiter accessLimiter;
  private final String frontendBaseUrl;

  public PublicLinkService(
      PublicLinkRepository linkRepository,
      ProviderConnectionRepository connectionRepository,
      ProviderConnectionService connectionService,
      ProviderRetryService retryService,
      CloudProviderClients providerClients,
      AuthenticatedUserService authenticatedUserService,
      ContentStreamResponder contentStreamResponder,
      PlatformTransactionManager transactionManager,
      Clock clock,
      @Value("${app.frontend-base-url}") String frontendBaseUrl,
      @Value("${app.public-links.max-accesses-per-minute:60}") int maxAccessesPerMinute,
      @Value("${app.public-links.max-tracked-keys:10000}") int maxTrackedKeys
  ) {
    this.linkRepository = linkRepository;
    this.connectionRepository = connectionRepository;
    this.connectionService = connectionService;
    this.retryService = retryService;
    this.providerClients = providerClients;
    this.authenticatedUserService = authenticatedUserService;
    this.contentStreamResponder = contentStreamResponder;
    this.shortTemplate = new TransactionTemplate(transactionManager);
    this.requiresNewTemplate = new TransactionTemplate(transactionManager);
    this.requiresNewTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    this.clock = clock;
    this.accessLimiter = new RateLimiter(maxAccessesPerMinute, ACCESS_WINDOW, maxTrackedKeys, clock);
    this.frontendBaseUrl = trimTrailingSlash(frontendBaseUrl);
  }

  @Transactional(readOnly = true)
  public OwnerPublicLinkResponse getOwnerLink(CloudProvider provider, String ref) {
    UUID userId = authenticatedUserService.requireUserId();
    ProviderConnectionEntity connection = connectionService.requireConnection(userId, provider);
    return linkRepository.findByConnectionIdAndItemRef(connection.getId(), ref)
        .map(link -> toOwnerResponse(link))
        .orElse(null);
  }

  // Links whose connection was removed are left out: their item can no longer be resolved.
  @Transactional(readOnly = true)
  public List<OwnerPublicLinkSummary> listOwnerLinks() {
    UUID userId = authenticatedUserService.requireUserId();
    Map<UUID, String> providerByConnection = new HashMap<>();
    connectionRepository.findByUserId(userId)
        .forEach(connection -> providerByConnection.put(connection.getId(), connection.getProvider()));

    return linkRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
        .filter(link -> providerByConnection.containsKey(link.getConnectionId()))
        .map(link -> new OwnerPublicLinkSummary(
            providerByConnection.get(link.getConnectionId()),
            link.getItemRef(),
            "file",
            link.getName(),
            link.getMimeType(),
            link.getExtension(),
            buildPublicUrl(link),
            link.getCreatedAt(),
            link.getLastAccessedAt()
        ))
        .toList();
  }

  @org.springframework.beans.factory.annotation.Autowired(required = false)
  private com.bridgit.api.catalog.HubEventStore events;

  @Transactional
  public OwnerPublicLinkResponse createOrGetOwnerLink(CloudProvider provider, String ref) {
    UUID userId = authenticatedUserService.requireUserId();
    ProviderConnectionEntity connection = connectionService.requireConnection(userId, provider);
    CloudItem item = fetchFileItem(provider, connection, ref);

    PublicLinkEntity link = linkRepository.findByConnectionIdAndItemRef(connection.getId(), ref)
        .orElseGet(() -> createLink(userId, connection, ref, item));

    link.setName(item.name());
    link.setMimeType(item.mimeType());
    link.setExtension(item.extension());
    link.setSize(item.size());
    linkRepository.save(link);
    notifyLink(userId, connection, ref, false);

    return toOwnerResponse(link);
  }

  @Transactional
  public void deleteOwnerLink(CloudProvider provider, String ref) {
    UUID userId = authenticatedUserService.requireUserId();
    connectionRepository.findByUserIdAndProvider(userId, provider.id()).ifPresent(connection ->
        linkRepository.findByConnectionIdAndItemRef(connection.getId(), ref).ifPresent(link -> {
          linkRepository.delete(link);
          notifyLink(userId, connection, ref, true);
        }));
  }

  // Other devices refresh on hub events; without one a link toggled elsewhere stays stale there.
  private void notifyLink(UUID userId, ProviderConnectionEntity connection, String ref, boolean removed) {
    if (events == null) return;
    events.append(userId, connection.getId(), connection.getGeneration(), "hub_entries",
        Map.of("entry", "public_link", "ref", ref, "removed", removed));
  }

  public PublicLinkMetadata getPublicMetadata(String suffix, String clientIp) {
    ResolvedPublicLink resolved = resolvePublicLink(suffix, clientIp);
    ReadPlan readPlan = publicProviderStep(() -> resolved.client().readPlan(resolved.item()));
    String readUrl = readPlan.mode() == ReadMode.NONE
        ? null
        : "/api/public/links/" + suffix + "/content?variant=read";

    recordAccess(resolved.link().getId(), resolved.item());

    return new PublicLinkMetadata(
        resolved.item().name(),
        resolved.item().mimeType(),
        resolved.item().extension(),
        resolved.item().size(),
        readPlan.mode(),
        resolved.provider().displayName(),
        "/api/public/links/" + suffix + "/content",
        readUrl
    );
  }

  public void streamPublicContent(
      String suffix,
      String variant,
      String rangeHeader,
      String clientIp,
      HttpServletResponse response
  ) throws IOException {
    ResolvedPublicLink context = resolvePublicLink(suffix, clientIp);
    ReadPlan readPlan = publicProviderStep(() -> context.client().readPlan(context.item()));

    boolean readVariant = "read".equalsIgnoreCase(variant);
    if (readVariant && readPlan.mode() == ReadMode.NONE) {
      throw linkNotFound();
    }

    ContentVariant contentVariant = readVariant ? readPlan.variant() : ContentVariant.ORIGINAL;
    ContentRange range = null;
    if (!readVariant && StringUtils.hasText(rangeHeader)) {
      range = ContentRange.parseSingle(rangeHeader, context.item().size());
    }
    ContentRange resolvedRange = range;
    // Once the response body starts the status cannot change, so every provider failure is handled here.
    ContentStream stream = publicProviderStep(() -> retryService.withRetry(
        context.connection(),
        token -> resolvedRange == null
            ? context.client().open(token, context.item(), contentVariant)
            : context.client().open(token, context.item(), contentVariant, resolvedRange)
    ));

    try (stream) {
      contentStreamResponder.write(
          stream,
          response,
          !readVariant,
          Map.of("X-Robots-Tag", "noindex, nofollow")
      );
    } catch (IOException ex) {
      try {
        stream.close();
      } catch (Exception ignored) {
      }
      throw ex;
    }

    recordAccess(context.link().getId(), context.item());
  }

  // Keeps the stored snapshot fresh and the last access current, in a single short write at most.
  private void recordAccess(UUID linkId, CloudItem item) {
    shortTemplate.executeWithoutResult(status ->
        linkRepository.findById(linkId).ifPresent(link -> {
          boolean changed = applySnapshot(link, item);
          OffsetDateTime now = OffsetDateTime.now(clock);
          OffsetDateTime last = link.getLastAccessedAt();
          if (last == null || last.isBefore(now.minus(LAST_ACCESS_RESOLUTION))) {
            link.setLastAccessedAt(now);
            changed = true;
          }
          if (changed) {
            linkRepository.save(link);
          }
        }));
  }

  private static boolean applySnapshot(PublicLinkEntity link, CloudItem item) {
    boolean changed = false;
    if (!Objects.equals(link.getName(), item.name())) {
      link.setName(item.name());
      changed = true;
    }
    if (!Objects.equals(link.getMimeType(), item.mimeType())) {
      link.setMimeType(item.mimeType());
      changed = true;
    }
    if (!Objects.equals(link.getExtension(), item.extension())) {
      link.setExtension(item.extension());
      changed = true;
    }
    if (!Objects.equals(link.getSize(), item.size())) {
      link.setSize(item.size());
      changed = true;
    }
    return changed;
  }

  private PublicLinkEntity createLink(
      UUID userId,
      ProviderConnectionEntity connection,
      String ref,
      CloudItem item
  ) {
    PublicLinkEntity link = new PublicLinkEntity();
    link.setUserId(userId);
    link.setConnectionId(connection.getId());
    link.setItemRef(ref);
    link.setSlug(LinkSlug.fromFileName(item.name(), item.extension()));
    link.setSuffix(generateUniqueSuffix());
    link.setName(item.name());
    link.setMimeType(item.mimeType());
    link.setExtension(item.extension());
    link.setSize(item.size());
    return link;
  }

  private String generateUniqueSuffix() {
    for (int attempt = 0; attempt < SUFFIX_COLLISION_RETRIES; attempt++) {
      String suffix = LinkSuffixGenerator.generate();
      if (!linkRepository.existsBySuffix(suffix)) {
        return suffix;
      }
    }
    throw new IllegalStateException("Não foi possível gerar um sufixo único para o link público.");
  }

  private ResolvedPublicLink resolvePublicLink(String suffix, String clientIp) {
    if (!LinkSuffixGenerator.isValid(suffix)) {
      throw linkNotFound();
    }
    enforceAccessLimit(suffix, clientIp);

    PublicLinkEntity link = linkRepository.findBySuffix(suffix).orElseThrow(this::linkNotFound);
    ProviderConnectionEntity connection = connectionService.findById(link.getConnectionId())
        .orElse(null);
    if (connection == null) {
      deleteLinkInNewTransaction(link.getId());
      throw linkNotFound();
    }

    try {
      CloudProvider provider = CloudProvider.fromId(connection.getProvider());
      CloudProviderClient client = providerClients.get(provider);
      CloudItem item = retryService.withRetry(
          connection,
          token -> client.get(token, link.getItemRef())
      );
      return new ResolvedPublicLink(link, provider, client, item, connection);
    } catch (RuntimeException ex) {
      boolean itemGone = ex instanceof NotFoundException
          || (ex instanceof ProviderApiException providerEx && providerEx.getStatus() == HttpStatus.NOT_FOUND);
      if (itemGone) {
        deleteLinkInNewTransaction(link.getId());
      }
      throw publicFailure(ex);
    }
  }

  // Per link and visitor address, counting metadata and content alike. Blocked attempts are not recorded,
  // so the window drains while the visitor waits.
  private void enforceAccessLimit(String suffix, String clientIp) {
    String key = suffix + "|" + (clientIp == null ? "" : clientIp);
    long retryAfter = accessLimiter.retryAfterSeconds(key);
    if (retryAfter > 0) {
      throw new TooManyRequestsException(TOO_MANY_ACCESSES_CODE, TOO_MANY_ACCESSES_MESSAGE, retryAfter);
    }
    accessLimiter.record(key);
  }

  private <T> T publicProviderStep(Supplier<T> step) {
    try {
      return step.get();
    } catch (RuntimeException ex) {
      throw publicFailure(ex);
    }
  }

  /**
   * One answer for the whole anonymous chain. What a visitor can do nothing about, or must not learn
   * (missing item, no permission, invalid token, reconnection needed), is a plain 404; only a provider
   * hiccup that may pass (429, 503, 504) says to try again. Anything else is left alone as a server error.
   */
  private RuntimeException publicFailure(RuntimeException ex) {
    if (ex instanceof ProviderApiException providerEx && isTransient(providerEx)) {
      logger.warn("Public link provider failure code={} status={}", providerEx.getCode(), providerEx.getStatus());
      return new LinkUnavailableException(LINK_UNAVAILABLE_MESSAGE, providerEx.getRetryAfterSeconds());
    }
    if (ex instanceof ApiException) {
      return linkNotFound();
    }
    return ex;
  }

  private static boolean isTransient(ProviderApiException ex) {
    HttpStatus status = ex.getStatus();
    return status == HttpStatus.TOO_MANY_REQUESTS
        || status == HttpStatus.SERVICE_UNAVAILABLE
        || status == HttpStatus.GATEWAY_TIMEOUT
        || "PROVEDOR_INDISPONIVEL".equals(ex.getCode())
        || "PROVEDOR_LIMITADO".equals(ex.getCode());
  }

  private void deleteLinkInNewTransaction(UUID linkId) {
    requiresNewTemplate.executeWithoutResult(status -> {
      linkRepository.findById(linkId).ifPresent(linkRepository::delete);
    });
  }

  private CloudItem fetchFileItem(CloudProvider provider, ProviderConnectionEntity connection, String ref) {
    CloudItem item = retryService.withRetry(
        connection,
        token -> providerClients.get(provider).get(token, ref)
    );
    if (item.kind() == ItemKind.FOLDER) {
      throw new BadRequestException("LINK_APENAS_ARQUIVO", "Somente arquivos podem receber link público.");
    }
    return item;
  }

  private OwnerPublicLinkResponse toOwnerResponse(PublicLinkEntity link) {
    return new OwnerPublicLinkResponse(buildPublicUrl(link), link.getSuffix());
  }

  private String buildPublicUrl(PublicLinkEntity link) {
    return frontendBaseUrl + "/p/" + link.getSlug() + "-" + link.getSuffix();
  }

  private NotFoundException linkNotFound() {
    return new NotFoundException(LINK_NOT_FOUND_CODE, LINK_NOT_FOUND_MESSAGE);
  }

  private static String trimTrailingSlash(String value) {
    if (value == null || value.isBlank()) {
      return value;
    }
    return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
  }

  private record ResolvedPublicLink(
      PublicLinkEntity link,
      CloudProvider provider,
      CloudProviderClient client,
      CloudItem item,
      ProviderConnectionEntity connection
  ) {
  }
}
