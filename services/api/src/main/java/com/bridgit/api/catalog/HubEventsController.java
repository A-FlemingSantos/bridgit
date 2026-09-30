package com.bridgit.api.catalog;

import com.bridgit.api.common.api.ApiEnvelope;
import com.bridgit.api.common.security.AuthenticatedUserService;
import java.util.List;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequestMapping("/api/hub/events")
public class HubEventsController {
  private final HubEventStore events;
  private final AuthenticatedUserService users;
  private final HubJson json;
  public HubEventsController(HubEventStore events, AuthenticatedUserService users, HubJson json) {
    this.events = events; this.users = users; this.json = json;
  }
  @GetMapping public ApiEnvelope<List<HubEventStore.Event>> since(@RequestParam(defaultValue = "0") long after) {
    return ApiEnvelope.ok(events.since(users.requireUserId(), Math.max(0, after)));
  }
  @GetMapping("/head") public ApiEnvelope<Long> head() { return ApiEnvelope.ok(events.latest(users.requireUserId())); }
  @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public StreamingResponseBody stream(@RequestParam(defaultValue = "0") long after) {
    UUID user = users.requireUserId();
    return out -> {
      long cursor = Math.max(0, after);
      // Bound each authenticated stream; reconnection rechecks the session and resumes its sequence.
      long until = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(25);
      try {
        while (System.nanoTime() < until && !Thread.currentThread().isInterrupted()) {
          for (HubEventStore.Event event : events.since(user, cursor)) {
            out.write(("id: " + event.sequence() + "\ndata: " + json.write(event) + "\n\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
            cursor = event.sequence();
          }
          out.write(": heartbeat\n\n".getBytes(java.nio.charset.StandardCharsets.UTF_8)); out.flush();
          try { Thread.sleep(1000); }
          catch (InterruptedException ex) { Thread.currentThread().interrupt(); break; }
        }
      } catch (AsyncRequestNotUsableException disconnected) {
        // A closed/reloaded tab makes this response unusable; there is no client left to send an error to.
      }
    };
  }
}
