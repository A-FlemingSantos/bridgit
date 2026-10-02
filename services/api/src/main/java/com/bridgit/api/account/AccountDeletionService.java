package com.bridgit.api.account;

import com.bridgit.api.auth.UserEntity;
import com.bridgit.api.auth.UserRepository;
import com.bridgit.api.common.error.UnauthorizedException;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountDeletionService {
  private final JdbcTemplate jdbc;
  private final UserRepository users;

  public AccountDeletionService(JdbcTemplate jdbc, UserRepository users) {
    this.jdbc = jdbc;
    this.users = users;
  }

  /** Commit the cleanup intent together with the user deletion, before removing any files. */
  @Transactional
  public List<String> delete(UserEntity user) {
    String id = user.getId().toString();
    if (jdbc.queryForList("SELECT id FROM users WITH(UPDLOCK,ROWLOCK) WHERE id=?", id).isEmpty()) {
      throw new UnauthorizedException("USUARIO_INVALIDO", "Nao foi possivel identificar o usuario autenticado.");
    }
    List<String> paths = jdbc.query("SELECT DISTINCT payload_path FROM cloud_operations WITH(UPDLOCK) WHERE user_id=? AND payload_path IS NOT NULL",
        (rs, row) -> rs.getString(1), id);
    for (String path : paths) {
      jdbc.update("INSERT INTO upload_cleanup_queue(payload_path) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM upload_cleanup_queue WHERE payload_path=?)", path, path);
    }
    users.delete(user);
    users.flush();
    return paths;
  }
}
