package com.bridgit.api.catalog;

import com.bridgit.api.common.security.AuthenticatedUserService;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class HubEventsControllerTest {
  @Test
  void closedClientEndsTheStreamWithoutAnInternalError() {
    UUID user = UUID.randomUUID();
    AuthenticatedUserService users = mock(AuthenticatedUserService.class);
    HubEventStore events = mock(HubEventStore.class);
    when(users.requireUserId()).thenReturn(user);
    when(events.since(user, 0)).thenReturn(List.of());
    var stream = new HubEventsController(events, users, mock(HubJson.class)).stream(0);
    var disconnected = new ByteArrayOutputStream() {
      @Override public void flush() throws IOException {
        throw new AsyncRequestNotUsableException("Client closed the response");
      }
    };
    assertThatCode(() -> stream.writeTo(disconnected)).doesNotThrowAnyException();
  }

  @Test
  void databaseFailuresRemainVisibleToTheErrorHandler() {
    UUID user = UUID.randomUUID();
    AuthenticatedUserService users = mock(AuthenticatedUserService.class);
    HubEventStore events = mock(HubEventStore.class);
    when(users.requireUserId()).thenReturn(user);
    when(events.since(user, 0)).thenThrow(new IllegalStateException("Database unavailable"));
    var stream = new HubEventsController(events, users, mock(HubJson.class)).stream(0);
    assertThatThrownBy(() -> stream.writeTo(new ByteArrayOutputStream()))
        .isInstanceOf(IllegalStateException.class).hasMessage("Database unavailable");
  }
}
