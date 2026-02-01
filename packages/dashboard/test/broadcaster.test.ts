
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { DashboardBroadcaster } from '../src/plugin/broadcaster';
import type { DashboardEvent } from "../src/plugin/types";

describe("DashboardBroadcaster", () => {
  let broadcaster: DashboardBroadcaster;

  beforeEach(() => {
    broadcaster = new DashboardBroadcaster();
  });

  afterEach(() => {
    // Cleanup if needed
  });

  test("should broadcast events to connected clients", async () => {
    const req = new Request("http://localhost/api/events");
    const response = broadcaster.addClient(req);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    const reader = response.body!.getReader();
    
    // Broadcast an event
    const event: DashboardEvent = {
      type: "task_start",
      namespace: "default",
      timestamp: new Date().toISOString(),
      data: { id: "1", title: "Test Task" }
    };

    broadcaster.broadcast(event);

    // Read initial connection message
    let { value, done } = await reader.read();
    let text = new TextDecoder().decode(value);
    expect(text).toContain(": connected\n\n");

    // Read event
    ({ value, done } = await reader.read());
    text = new TextDecoder().decode(value);
    expect(text).toContain(`data: ${JSON.stringify(event)}\n\n`);
    
    reader.cancel();
  });

  test("should filter events based on query params", async () => {
    // Client asking only for 'task_start'
    const req = new Request("http://localhost/api/events?events=task_start");
    const response = broadcaster.addClient(req);
    const reader = response.body!.getReader();
    
    // Broadcast filtered out event
    const ignoredEvent: DashboardEvent = {
      type: "task_complete",
      namespace: "default",
      timestamp: new Date().toISOString(),
      data: { id: "1" }
    };
    broadcaster.broadcast(ignoredEvent);

    // Broadcast matching event
    const matchingEvent: DashboardEvent = {
      type: "task_start",
      namespace: "default",
      timestamp: new Date().toISOString(),
      data: { id: "2" }
    };
    broadcaster.broadcast(matchingEvent);

    // Read initial connection message
    let { value } = await reader.read();
    let text = new TextDecoder().decode(value);
    expect(text).toContain(": connected\n\n");

    // Read from stream
    ({ value } = await reader.read());
    text = new TextDecoder().decode(value);
    
    // Should NOT contain task_complete
    expect(text).not.toContain("task_complete");
    // Should contain task_start
    expect(text).toContain("task_start");
    
    reader.cancel();
  });
});
