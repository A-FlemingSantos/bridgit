package com.bridgit.api.links;

import com.bridgit.api.common.error.BadRequestException;
import com.bridgit.api.common.error.NotFoundException;
import com.bridgit.api.common.security.AuthenticatedUserService;
import com.bridgit.api.integrations.ProviderConnectionEntity;
import com.bridgit.api.integrations.ProviderConnectionRepository;
import com.bridgit.api.integrations.ProviderConnectionService;
import com.bridgit.api.integrations.ProviderRetryService;
import com.bridgit.api.integrations.ReconnectionRequiredException;
import com.bridgit.api.links.LinkDtos.OwnerPublicLinkResponse;
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
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
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
  private static final String LINK_NOT_FOUND_MESSAGE = "Este link publico nao esta disponivel.";
  private static final int SUFFIX_COLLISION_RETRIES = 8;

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
      @Value("${app.frontend-base-url}") String frontendBaseUrl
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

    return toOwnerResponse(link);
  }

  @Transactional
  public void deleteOwnerLink(CloudProvider provider, String ref) {
    UUID userId = authenticatedUserService.requireUserId();
    connectionRepository.findByUserIdAndProvider(userId, provider.id())
        .flatMap(connection -> linkRepository.findByConnectionIdAndItemRef(connection.getId(), ref))
        .ifPresent(linkRepository::delete);
  }

  @Transactional
  public PublicLinkMetadata getPublicMetadata(String suffix) {
    ResolvedPublicLink resolved = resolvePublicLink(suffix);
    ReadPlan readPlan = resolved.client().readPlan(resolved.item());
    String readUrl = readPlan.mode() == ReadMode.NONE
        ? null
        : "/api/public/links/" + suffix + "/content?variant=read";

    resolved.link().setLastAccessedAt(OffsetDateTime.now(clock));
    linkRepository.save(resolved.link());

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

  public void streamPublicContent(String suffix, String variant, HttpServletResponse response) throws IOException {
    streamPublicContent(suffix, variant, null, response);
  }

  public void streamPublicContent(
      String suffix,
      String variant,
      String rangeHeader,
      HttpServletResponse response
  ) throws IOException {
    PublicLinkContext context = shortTemplate.execute(status -> resolveLinkContext(suffix));
    ReadPlan readPlan = context.client().readPlan(context.item());

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
    ContentStream stream = retryService.withRetry(
        context.connection(),
        token -> resolvedRange == null
            ? context.client().open(token, context.item(), contentVariant)
            : context.client().open(token, context.item(), contentVariant, resolvedRange)
    );

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

    shortTemplate.executeWithoutResult(status -> {
      linkRepository.findById(context.linkId()).ifPresent(link -> {
        link.setLastAccessedAt(OffsetDateTime.now(clock));
        linkRepository.save(link);
      });
    });
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
    throw new IllegalStateException("Nao foi possivel gerar um sufixo unico para o link publico.");
  }

  private PublicLinkContext resolveLinkContext(String suffix) {
    ResolvedPublicLink resolved = resolvePublicLink(suffix);
    return new PublicLinkContext(
        resolved.link().getId(),
        resolved.provider(),
        resolved.client(),
        resolved.item(),
        resolved.accessToken(),
        resolved.connection()
    );
  }

  private ResolvedPublicLink resolvePublicLink(String suffix) {
    if (!LinkSuffixGenerator.isValid(suffix)) {
      throw linkNotFound();
    }

    PublicLinkEntity link = linkRepository.findBySuffix(suffix).orElseThrow(this::linkNotFound);
    ProviderConnectionEntity connection = connectionService.findById(link.getConnectionId())
        .orElse(null);
    if (connection == null) {
      deleteLinkInNewTransaction(link.getId());
      throw linkNotFound();
    }

    CloudProvider provider = CloudProvider.fromId(connection.getProvider());
    CloudProviderClient client = providerClients.get(provider);

    try {
      CloudItem item = retryService.withRetry(
          connection,
          token -> client.get(token, link.getItemRef())
      );
      String accessToken = connectionService.accessToken(connection);

      link.setName(item.name());
      link.setMimeType(item.mimeType());
      link.setExtension(item.extension());
      link.setSize(item.size());
      linkRepository.save(link);

      return new ResolvedPublicLink(link, provider, client, item, accessToken, connection);
    } catch (ReconnectionRequiredException ex) {
      throw linkNotFound();
    } catch (ProviderApiException ex) {
      if ("TOKEN_PROVEDOR_INVALIDO".equals(ex.getCode())) {
        throw ex;
      }
      if (ex.getStatus() == HttpStatus.NOT_FOUND) {
        deleteLinkInNewTransaction(link.getId());
      }
      throw linkNotFound();
    } catch (NotFoundException ex) {
      deleteLinkInNewTransaction(link.getId());
      throw linkNotFound();
    }
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
      throw new BadRequestException("LINK_APENAS_ARQUIVO", "Somente arquivos podem receber link publico.");
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
      String accessToken,
      ProviderConnectionEntity connection
  ) {
  }

  private record PublicLinkContext(
      UUID linkId,
      CloudProvider provider,
      CloudProviderClient client,
      CloudItem item,
      String accessToken,
      ProviderConnectionEntity connection
  ) {
  }
}
