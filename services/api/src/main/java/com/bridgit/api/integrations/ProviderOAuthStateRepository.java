package com.bridgit.api.integrations;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProviderOAuthStateRepository extends JpaRepository<ProviderOAuthStateEntity, UUID> {

  Optional<ProviderOAuthStateEntity> findByStateToken(String stateToken);
}
