package com.bridgit.api.integrations;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProviderOAuthStateRepository extends JpaRepository<ProviderOAuthStateEntity, UUID> {

  Optional<ProviderOAuthStateEntity> findByStateToken(String stateToken);

  // Atomic: only one caller can consume a state, even with concurrent callbacks.
  @Modifying
  @Query("update ProviderOAuthStateEntity s set s.usedAt = :usedAt where s.id = :id and s.usedAt is null")
  int markUsed(@Param("id") UUID id, @Param("usedAt") OffsetDateTime usedAt);

  // Gives the state back after a transient failure; it still expires by expiresAt.
  @Modifying
  @Query("update ProviderOAuthStateEntity s set s.usedAt = null where s.id = :id")
  int release(@Param("id") UUID id);
}
