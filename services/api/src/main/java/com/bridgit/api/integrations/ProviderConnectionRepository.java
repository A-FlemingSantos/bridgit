package com.bridgit.api.integrations;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProviderConnectionRepository extends JpaRepository<ProviderConnectionEntity, UUID> {

  List<ProviderConnectionEntity> findByUserId(UUID userId);

  Optional<ProviderConnectionEntity> findByUserIdAndProvider(UUID userId, String provider);

  void deleteByUserIdAndProvider(UUID userId, String provider);
}
