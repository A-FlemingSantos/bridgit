package com.bridgit.api.integrations;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProviderConnectionRepository extends JpaRepository<ProviderConnectionEntity, UUID> {

  List<ProviderConnectionEntity> findByUserId(UUID userId);

  List<ProviderConnectionEntity> findByUserIdOrderByCreatedAtAscIdAsc(UUID userId);

  List<ProviderConnectionEntity> findByUserIdAndProviderOrderByCreatedAtAscIdAsc(UUID userId, String provider);

  Optional<ProviderConnectionEntity> findFirstByUserIdAndProviderOrderByCreatedAtAscIdAsc(UUID userId, String provider);

  Optional<ProviderConnectionEntity> findByUserIdAndProviderAndAccountId(UUID userId, String provider, String accountId);

  Optional<ProviderConnectionEntity> findByIdAndUserId(UUID id, UUID userId);

  // A user may hold several accounts of one provider; provider-keyed callers get the oldest one.
  default Optional<ProviderConnectionEntity> findByUserIdAndProvider(UUID userId, String provider) {
    return findFirstByUserIdAndProviderOrderByCreatedAtAscIdAsc(userId, provider);
  }
}
