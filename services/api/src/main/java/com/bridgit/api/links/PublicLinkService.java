package com.bridgit.api.links;

import static com.bridgit.api.links.PublicLinkErrors.linkNotFound;
import static com.bridgit.api.links.PublicLinkErrors.publicFailure;
import static com.bridgit.api.links.PublicLinkErrors.publicProviderStep;

import com.bridgit.api.common.error.BadRequestException;
import com.bridgit.api.common.error.ConflictException;
import com.bridgit.api.common.error.NotFoundException;
import com.bridgit.api.common.error.TooManyRequestsException;
import com.bridgit.api.common.security.AuthenticatedUserService;
import com.bridgit.api.common.security.RateLimiter;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionRepository;
import com.bridgit.api.integrations.ProviderConnectionService;
import com.bridgit.api.integrations.ProviderRetryService;
import com.bridgit.api.links.LinkDtos.OwnerPublicLink;
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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

@Service
public class PublicLinkService {

  private static final String TOO_MANY_ACCESSES_CODE = "MUITOS_ACESSOS";
  private static final String TOO_MANY_ACCESSES_MESSAGE = "Muitos acessos a este link. Tente de novo em instantes.";
  private static final int CODE_COLLISION_RETRIES = 8;
  private static final Duration ACCESS_WINDOW = Duration.ofMinutes(1);
  // Visits and range requests would otherwise rewrite the row every time; a minute of resolution is plenty.
  private static final Duration LAST_ACCESS_RESOLUTION = Duration.ofMinutes(1);

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
  // Per link and visitor address, counting metadata and content alike.
  private final RateLimiter accessLimiter;
  // Per link across every visitor, to protect the owner's provider quota.
  private final RateLimiter linkAggregateLimiter;
  // Per visitor address: lookups that matched no link, against guessing aliases and codes.
  private final RateLimiter failedLookupLimiter;
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
      @Value("${app.public-links.max-accesses-per-link-per-minute:600}") int maxLinkAccessesPerMinute,
      @Value("${app.public-links.max-failed-lookups:20}") int maxFailedLookups,
      @Value("${app.public-links.failed-lookup-window-minutes:15}") int failedLookupWindowMinutes,
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
    this.linkAggregateLimiter = new RateLimiter(maxLinkAccessesPerMinute, ACCESS_WINDOW, maxTrackedKeys, clock);
    this.failedLookupLimiter = new RateLimiter(
        maxFailedLookups, Duration.ofMinutes(failedLookupWindowMinutes), maxTrackedKeys, clock);
    this.frontendBaseUrl = trimTrailingSlash(frontendBaseUrl);
  }

  @Transactional(readOnly = true)
  public OwnerPublicLink getOwnerLink(CloudProvider provider, String ref) {
    UUID userId = authenticatedUserService.requireUserId();
    ProviderConnectionEntity connection = connectionService.requireConnection(userId, provider);
    return linkRepository.findByConnectionIdAndItemRef(connection.getId(), ref)
        .map(this::toOwnerResponse)
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
            link.getKind(),
            link.getName(),
            link.getMimeType(),
            link.getExtension(),
            buildPublicUrl(link),
            link.getSlug(),
            link.getSuffix(),
            link.getCreatedAt(),
            link.getLastAccessedAt()
        ))
        .toList();
  }

  @org.springframework.beans.factory.annotation.Autowired(required = false)
  private com.bridgit.api.catalog.HubEventStore events;

  @Transactional
  public OwnerPublicLink createOrGetOwnerLink(CloudProvider provider, String ref) {
    UUID userId = authenticatedUserService.requireUserId();
    ProviderConnectionEntity connection = connectionService.requireConnection(userId, provider);
    CloudItem item = fetchPublishableItem(provider, connection, ref);

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

  public PublicLinkMetadata getPublicMetadata(String linkRef, String clientIp) {
    ResolvedPublicLink ctx = resolve(linkRef, clientIp);
    CloudItem root = ctx.root();

    PublicLinkMetadata metadata;
    if (ctx.link().isFolder()) {
      metadata = new PublicLinkMetadata(
          PublicLinkEntity.KIND_FOLDER, root.name(), null, null, null, null, ctx.provider().displayName(), null, null);
    } else {
      metadata = fileMetadata(ctx, root, "/api/public/links/" + canonicalRef(ctx.link()));
    }
    recordAccess(ctx.link().getId(), root);
    return metadata;
  }

  public void streamPublicContent(
      String linkRef,
      String variant,
      String rangeHeader,
      String clientIp,
      HttpServletResponse response
  ) throws IOException {
    ResolvedPublicLink ctx = resolve(linkRef, clientIp);
    if (ctx.link().isFolder()) {
      throw linkNotFound();
    }
    streamItem(ctx, ctx.root(), variant, rangeHeader, response);
    recordAccess(ctx.link().getId(), ctx.root());
  }

  /**
   * Every anonymous request starts here. Alias and code must both match; the visitor must be under the
   * failed-lookup limit (checked before any lookup) and the per-link limits; then the shared item is
   * fetched from the provider, and a link whose item or connection is gone cleans itself up.
   */
  ResolvedPublicLink resolve(String linkRef, String clientIp) {
    enforceFailedLookupLimit(clientIp);

    LinkAddress address = LinkAddress.parse(linkRef).orElse(null);
    if (address == null) {
      recordFailedLookup(clientIp);
      throw linkNotFound();
    }
    PublicLinkEntity link = linkRepository.findBySlugAndSuffix(address.alias(), address.code()).orElse(null);
    if (link == null) {
      recordFailedLookup(clientIp);
      throw linkNotFound();
    }
    enforceAccessLimit(link.getId(), clientIp);

    ProviderConnectionEntity connection = connectionService.findById(link.getConnectionId())
        .orElse(null);
    if (connection == null) {
      deleteLinkInNewTransaction(link.getId());
      throw linkNotFound();
    }

    try {
      CloudProvider provider = CloudProvider.fromId(connection.getProvider());
      CloudProviderClient client = providerClients.get(provider);
      CloudItem root = retryService.withRetry(
          connection,
          token -> client.get(token, link.getItemRef())
      );
      return new ResolvedPublicLink(link, connection, provider, client, root);
    } catch (RuntimeException ex) {
      boolean itemGone = ex instanceof NotFoundException
          || (ex instanceof ProviderApiException providerEx && providerEx.getStatus() == HttpStatus.NOT_FOUND);
      if (itemGone) {
        deleteLinkInNewTransaction(link.getId());
      }
      throw publicFailure(ex);
    }
  }

  void recordFailedLookup(String clientIp) {
    failedLookupLimiter.record(ipKey(clientIp));
  }

  /** Updates only last_accessed_at, at most once a minute; the stored snapshot is left alone. */
  void touchLastAccess(UUID linkId) {
    shortTemplate.executeWithoutResult(status ->
        linkRepository.findById(linkId).ifPresent(link -> {
          if (touchIfStale(link)) {
            linkRepository.save(link);
          }
        }));
  }

  /** Metadata of a file; its content is served under {@code contentPath + "/content"}. */
  PublicLinkMetadata fileMetadata(ResolvedPublicLink ctx, CloudItem item, String contentPath) {
    ReadPlan readPlan = publicProviderStep(() -> ctx.client().readPlan(item));
    String readUrl = readPlan.mode() == ReadMode.NONE
        ? null
        : contentPath + "/content?variant=read";
    return new PublicLinkMetadata(
        PublicLinkEntity.KIND_FILE,
        item.name(),
        item.mimeType(),
        item.extension(),
        item.size(),
        readPlan.mode(),
        ctx.provider().displayName(),
        contentPath + "/content",
        readUrl
    );
  }

  /** Streams one file of the link (original, or the "read" variant) with the range/variant rules of public files. */
  void streamItem(
      ResolvedPublicLink ctx,
      CloudItem item,
      String variant,
      String rangeHeader,
      HttpServletResponse response
  ) throws IOException {
    ReadPlan readPlan = publicProviderStep(() -> ctx.client().readPlan(item));

    boolean readVariant = "read".equalsIgnoreCase(variant);
    if (readVariant && readPlan.mode() == ReadMode.NONE) {
      throw linkNotFound();
    }

    ContentVariant contentVariant = readVariant ? readPlan.variant() : ContentVariant.ORIGINAL;
    ContentRange range = null;
    if (!readVariant && StringUtils.hasText(rangeHeader)) {
      range = ContentRange.parseSingle(rangeHeader, item.size());
    }
    ContentRange resolvedRange = range;
    // Once the response body starts the status cannot change, so every provider failure is handled here.
    ContentStream stream = publicProviderStep(() -> retryService.withRetry(
        ctx.connection(),
        token -> resolvedRange == null
            ? ctx.client().open(token, item, contentVariant)
            : ctx.client().open(token, item, contentVariant, resolvedRange)
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
  }

  /** The alias and code as they appear in the URL. */
  String canonicalRef(PublicLinkEntity link) {
    return link.getSlug() + "-" + link.getSuffix();
  }

  // Keeps the stored snapshot fresh and the last access current, in a single short write at most.
  private void recordAccess(UUID linkId, CloudItem item) {
    shortTemplate.executeWithoutResult(status ->
        linkRepository.findById(linkId).ifPresent(link -> {
          boolean changed = applySnapshot(link, item);
          changed |= touchIfStale(link);
          if (changed) {
            linkRepository.save(link);
          }
        }));
  }

  private boolean touchIfStale(PublicLinkEntity link) {
    OffsetDateTime now = OffsetDateTime.now(clock);
    OffsetDateTime last = link.getLastAccessedAt();
    if (last == null || last.isBefore(now.minus(LAST_ACCESS_RESOLUTION))) {
      link.setLastAccessedAt(now);
      return true;
    }
    return false;
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
    boolean folder = item.kind() == ItemKind.FOLDER;
    String alias = folder
        ? LinkSlug.fromFolderName(item.name())
        : LinkSlug.fromFileName(item.name(), item.extension());

    PublicLinkEntity link = new PublicLinkEntity();
    link.setUserId(userId);
    link.setConnectionId(connection.getId());
    link.setItemRef(ref);
    link.setKind(folder ? PublicLinkEntity.KIND_FOLDER : PublicLinkEntity.KIND_FILE);
    link.setSlug(alias);
    link.setSuffix(generateUniqueCode(alias));
    link.setName(item.name());
    link.setMimeType(item.mimeType());
    link.setExtension(item.extension());
    link.setSize(item.size());
    try {
      return linkRepository.saveAndFlush(link);
    } catch (DataIntegrityViolationException ex) {
      throw new ConflictException("LINK_CONFLITO", "Não foi possível criar o link público agora. Tente de novo.");
    }
  }

  // A code only has to be unique among the links sharing the alias.
  private String generateUniqueCode(String alias) {
    for (int attempt = 0; attempt < CODE_COLLISION_RETRIES; attempt++) {
      String code = LinkCode.generate();
      if (!linkRepository.existsBySlugAndSuffix(alias, code)) {
        return code;
      }
    }
    throw new ConflictException("LINK_CONFLITO", "Não foi possível criar o link público agora. Tente de novo.");
  }

  // Blocked attempts are not recorded, so the window drains while the visitor waits.
  private void enforceAccessLimit(UUID linkId, String clientIp) {
    String linkKey = linkId.toString();
    String visitorKey = linkKey + "|" + ipKey(clientIp);
    long retryAfter = Math.max(
        accessLimiter.retryAfterSeconds(visitorKey),
        linkAggregateLimiter.retryAfterSeconds(linkKey));
    if (retryAfter > 0) {
      throw new TooManyRequestsException(TOO_MANY_ACCESSES_CODE, TOO_MANY_ACCESSES_MESSAGE, retryAfter);
    }
    accessLimiter.record(visitorKey);
    linkAggregateLimiter.record(linkKey);
  }

  private void enforceFailedLookupLimit(String clientIp) {
    long retryAfter = failedLookupLimiter.retryAfterSeconds(ipKey(clientIp));
    if (retryAfter > 0) {
      throw new TooManyRequestsException(TOO_MANY_ACCESSES_CODE, TOO_MANY_ACCESSES_MESSAGE, retryAfter);
    }
  }

  private static String ipKey(String clientIp) {
    return clientIp == null ? "" : clientIp;
  }

  private void deleteLinkInNewTransaction(UUID linkId) {
    requiresNewTemplate.executeWithoutResult(status -> {
      linkRepository.findById(linkId).ifPresent(linkRepository::delete);
    });
  }

  // Files and folders can be published, but not the provider root itself.
  private CloudItem fetchPublishableItem(CloudProvider provider, ProviderConnectionEntity connection, String ref) {
    if (!StringUtils.hasText(ref) || "root".equalsIgnoreCase(ref.trim())) {
      throw new BadRequestException("LINK_RAIZ_INVALIDA", "A raiz do provedor não pode receber link público.");
    }
    return retryService.withRetry(
        connection,
        token -> providerClients.get(provider).get(token, ref)
    );
  }

  private OwnerPublicLink toOwnerResponse(PublicLinkEntity link) {
    return new OwnerPublicLink(
        buildPublicUrl(link), link.getSlug(), link.getSuffix(), link.getKind(), link.getSuffix());
  }

  private String buildPublicUrl(PublicLinkEntity link) {
    return frontendBaseUrl + "/p/" + canonicalRef(link);
  }

  private static String trimTrailingSlash(String value) {
    if (value == null || value.isBlank()) {
      return value;
    }
    return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
  }
}
