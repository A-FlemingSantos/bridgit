package com.bridgit.api.integrations;

import com.bridgit.api.common.error.ConflictException;

public class ReconnectionRequiredException extends ConflictException {

  public ReconnectionRequiredException() {
    super("RECONEXAO_NECESSARIA", "É necessário reconectar este provedor de nuvem.");
  }
}
