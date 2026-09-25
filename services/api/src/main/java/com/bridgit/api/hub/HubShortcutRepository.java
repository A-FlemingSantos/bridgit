package com.bridgit.api.hub;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface HubShortcutRepository extends JpaRepository<HubShortcutEntity, UUID> {

  List<HubShortcutEntity> findByUserIdOrderByPinnedAtDesc(UUID userId);

  Optional<HubShortcutEntity> findByConnectionIdAndItemRef(UUID connectionId, String itemRef);

  void deleteByConnectionIdAndItemRef(UUID connectionId, String itemRef);

  @Modifying
  @Query("""
      UPDATE HubShortcutEntity s
      SET s.name = :name, s.mimeType = :mimeType, s.extension = :extension
      WHERE s.connectionId = :connectionId AND s.itemRef = :itemRef
      """)
  int updateSnapshot(
      @Param("connectionId") UUID connectionId,
      @Param("itemRef") String itemRef,
      @Param("name") String name,
      @Param("mimeType") String mimeType,
      @Param("extension") String extension
  );
}
