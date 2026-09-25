package com.bridgit.api.hub;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface HubRecentRepository extends JpaRepository<HubRecentEntity, UUID> {

  List<HubRecentEntity> findTop12ByUserIdAndConnectionIdInOrderByOpenedAtDesc(
      UUID userId,
      Collection<UUID> connectionIds
  );

  List<HubRecentEntity> findByUserIdOrderByOpenedAtDesc(UUID userId);

  Optional<HubRecentEntity> findByConnectionIdAndItemRef(UUID connectionId, String itemRef);

  void deleteByConnectionIdAndItemRef(UUID connectionId, String itemRef);

  @Modifying
  @Query("""
      UPDATE HubRecentEntity r
      SET r.name = :name, r.mimeType = :mimeType, r.extension = :extension
      WHERE r.connectionId = :connectionId AND r.itemRef = :itemRef
      """)
  int updateSnapshot(
      @Param("connectionId") UUID connectionId,
      @Param("itemRef") String itemRef,
      @Param("name") String name,
      @Param("mimeType") String mimeType,
      @Param("extension") String extension
  );
}
