package com.bridgit.api.integrations;

import com.bridgit.api.common.error.ConflictException;

public class ReconnectionRequiredException extends ConflictException {

  public ReconnectionRequiredException() {
    super("RECONEXAO_NECESSARIA", "E necessario reconectar este provedor de nuvem.");
  }
}
