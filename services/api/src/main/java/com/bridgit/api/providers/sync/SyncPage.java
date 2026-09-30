package com.bridgit.api.providers.sync;

import java.util.List;

/** checkpoint is opaque, internal and replayable; caughtUp means an inventory/delta round ended. */
public record SyncPage(List<CloudChange> changes, String checkpoint, boolean caughtUp, String rootRef) {
  public SyncPage {
    changes = List.copyOf(changes);
  }
}
