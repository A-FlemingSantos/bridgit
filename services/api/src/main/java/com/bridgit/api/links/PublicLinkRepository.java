package com.bridgit.api.links;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PublicLinkRepository extends JpaRepository<PublicLinkEntity, UUID> {

  Optional<PublicLinkEntity> findByConnectionIdAndItemRef(UUID connectionId, String itemRef);

  Optional<PublicLinkEntity> findBySuffix(String suffix);

  boolean existsBySuffix(String suffix);

  void deleteByConnectionIdAndItemRef(UUID connectionId, String itemRef);

  @Modifying
  @Query("""
      UPDATE PublicLinkEntity l
      SET l.name = :name, l.mimeType = :mimeType, l.extension = :extension, l.size = :size
      WHERE l.connectionId = :connectionId AND l.itemRef = :itemRef
      """)
  int updateSnapshot(
      @Param("connectionId") UUID connectionId,
      @Param("itemRef") String itemRef,
      @Param("name") String name,
      @Param("mimeType") String mimeType,
      @Param("extension") String extension,
      @Param("size") Long size
  );
}
