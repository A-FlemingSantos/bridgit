package com.bridgit.api.integrations.avatar;

import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.SqlParameterValue;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcConnectionAvatarStore implements ConnectionAvatarStore {

  private static final String STATUS_OK = "ok";
  private static final String STATUS_NONE = "none";

  private final JdbcTemplate jdbc;

  public JdbcConnectionAvatarStore(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public Optional<StoredAvatar> find(UUID connectionId) {
    return jdbc.query(
        "SELECT generation, status, content_type, bytes, etag, fetched_at "
            + "FROM provider_connection_avatars WHERE connection_id=?",
        (rs, row) -> {
          OffsetDateTime fetchedAt = rs.getObject("fetched_at", OffsetDateTime.class);
          long generation = rs.getLong("generation");
          if (!STATUS_OK.equals(rs.getString("status"))) {
            return StoredAvatar.none(generation, fetchedAt);
          }
          return StoredAvatar.photo(
              generation,
              rs.getString("content_type"),
              rs.getBytes("bytes"),
              rs.getString("etag"),
              fetchedAt
          );
        },
        connectionId.toString()
    ).stream().findFirst();
  }

  // Not a transaction: the row is a cache. The generation guard keeps a slow fetch for an old
  // generation from overwriting the photo already stored for a newer one.
  @Override
  public void save(UUID connectionId, StoredAvatar avatar) {
    String id = connectionId.toString();
    String status = avatar.hasPhoto() ? STATUS_OK : STATUS_NONE;
    if (update(id, avatar, status) > 0) {
      return;
    }
    try {
      jdbc.update(
          "INSERT INTO provider_connection_avatars"
              + "(connection_id, generation, status, content_type, bytes, etag, fetched_at) VALUES(?,?,?,?,?,?,?)",
          id, avatar.generation(), status, text(avatar.contentType()), binary(avatar.bytes()), text(avatar.etag()),
          avatar.fetchedAt()
      );
    } catch (DuplicateKeyException ex) {
      update(id, avatar, status);
    }
  }

  private int update(String id, StoredAvatar avatar, String status) {
    return jdbc.update(
        "UPDATE provider_connection_avatars SET generation=?, status=?, content_type=?, bytes=?, etag=?, "
            + "fetched_at=? WHERE connection_id=? AND generation<=?",
        avatar.generation(), status, text(avatar.contentType()), binary(avatar.bytes()), text(avatar.etag()),
        avatar.fetchedAt(), id, avatar.generation()
    );
  }

  // Typed so a null reaches SQL Server as varchar/varbinary rather than an untyped NULL.
  private static SqlParameterValue text(String value) {
    return new SqlParameterValue(Types.VARCHAR, value);
  }

  private static SqlParameterValue binary(byte[] value) {
    return new SqlParameterValue(Types.VARBINARY, value);
  }
}
