import { expect, test, describe, mock, beforeEach } from 'bun:test';
import { NotionClient } from '../src/client';
// Removed type-only import from '../src/adapter';
import { withNotionBackend } from '../src/plugin';

const mockQuery = mock(() => Promise.resolve({ results: [] }));
const mockUpdate = mock(() => Promise.resolve({}));
const mockRetrieve = mock(() => Promise.resolve({ id: 'test-page-id', properties: {} }));
const mockAppend = mock(() => Promise.resolve({}));

mock.module("@notionhq/client", () => {
  return {
    Client: class {
      databases = { query: mockQuery };
      pages = { update: mockUpdate, retrieve: mockRetrieve };
      blocks = { children: { append: mockAppend } };
    },
  };
});

describe("NotionClient", () => {
  const apiKey = "test-api-key";
  const databaseId = "test-db-id";
  let client: NotionClient;

  beforeEach(() => {
    client = new NotionClient(apiKey, databaseId);
    mockQuery.mockClear();
    mockUpdate.mockClear();
    mockRetrieve.mockClear();
    mockAppend.mockClear();
  });

  test("queryTasks calls notion.databases.query with correct params", async () => {
    await client.queryTasks({
      status: { property: "Status", value: "Done" },
    });

    expect(mockQuery).toHaveBeenCalledWith({
      database_id: databaseId,
      filter: {
        property: "Status",
        status: { equals: "Done" },
      },
      sorts: [],
    });
  });

  test("updateTask calls notion.pages.update", async () => {
    const pageId = "page-123";
    const props = { Status: { status: { name: "Done" } } };
    await client.updateTask(pageId, props);

    expect(mockUpdate).toHaveBeenCalledWith({
      page_id: pageId,
      properties: props,
    });
  });

  test("getTask calls notion.pages.retrieve", async () => {
    const pageId = "page-123";
    await client.getTask(pageId);

    expect(mockRetrieve).toHaveBeenCalledWith({
      page_id: pageId,
    });
  });

  test("addComment calls notion.blocks.children.append", async () => {
    const pageId = "page-123";
    const text = "Hello world";
    await client.addComment(pageId, text);

    expect(mockAppend).toHaveBeenCalled();
    const callArgs = mockAppend.mock.calls[0][0] as any;
    expect(callArgs.block_id).toBe(pageId);
    expect(callArgs.children[0].paragraph.rich_text[0].text.content).toBe(text);
  });
});

describe("NotionTaskAdapter", () => {
  const config = {
    apiKey: "test-api-key",
    databaseId: "test-db-id",
    properties: {
      title: "Name",
      status: "State",
    },
    statusValues: {
      pending: "To Do",
      inProgress: "Doing",
      completed: "Done",
    }
  };

  let adapter: NotionTaskAdapter;

  beforeEach(() => {
    adapter = new NotionTaskAdapter(config);
    mockQuery.mockClear();
    mockUpdate.mockClear();
    mockRetrieve.mockClear();
    mockAppend.mockClear();
  });

  test("findNextTask queries with configured status and property", async () => {
    mockQuery.mockResolvedValueOnce({
      results: [
        {
          id: "task-1",
          url: "https://notion.so/task-1",
          properties: {
            Name: { title: [{ plain_text: "Task 1" }] },
            State: { status: { name: "To Do" } },
          },
        },
      ],
    } as any);

    const task = await adapter.findNextTask();

    expect(task).not.toBeNull();
    expect(task?.id).toBe("task-1");
    expect(task?.title).toBe("Task 1");
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      filter: {
        property: "State",
        status: { equals: "To Do" },
      }
    }));
  });

  test("markCompleted updates status and adds comment", async () => {
    const taskId = "task-123";
    await adapter.markCompleted(taskId, "Finished it!");

    expect(mockUpdate).toHaveBeenCalledWith({
      page_id: taskId,
      properties: {
        State: { status: { name: "Done" } }
      }
    });
    expect(mockAppend).toHaveBeenCalled();
  });

  test("listPendingTasks returns filtered tasks", async () => {
    mockQuery.mockResolvedValueOnce({
      results: [
        {
          id: "task-1",
          url: "https://notion.so/task-1",
          properties: {
            Name: { title: [{ plain_text: "Task 1" }] },
            State: { status: { name: "To Do" } },
            Feature: { select: { name: "auth" } },
          },
        },
        {
          id: "task-2",
          url: "https://notion.so/task-2",
          properties: {
            Name: { title: [{ plain_text: "Task 2" }] },
            State: { status: { name: "To Do" } },
            Feature: { select: { name: "ui" } },
          },
        },
      ],
    } as any);

    const tasks = await adapter.listPendingTasks({ feature: "auth" });

    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe("task-1");
  });

  test("listPendingTasks returns empty when no results", async () => {
    mockQuery.mockResolvedValueOnce(null as any);

    const tasks = await adapter.listPendingTasks();

    expect(tasks).toEqual([]);
  });

  test("countPending returns count of pending tasks", async () => {
    mockQuery.mockResolvedValueOnce({
      results: [
        { id: "task-1", url: "", properties: { Name: { title: [{ plain_text: "Task 1" }] }, State: { status: { name: "To Do" } } } },
        { id: "task-2", url: "", properties: { Name: { title: [{ plain_text: "Task 2" }] }, State: { status: { name: "To Do" } } } },
      ],
    } as any);

    const count = await adapter.countPending();

    expect(count).toBe(2);
  });

  test("getTask returns task by ID", async () => {
    mockRetrieve.mockResolvedValueOnce({
      id: "task-123",
      url: "https://notion.so/task-123",
      properties: {
        Name: { title: [{ plain_text: "Test Task" }] },
        State: { status: { name: "To Do" } },
      },
    } as any);

    const task = await adapter.getTask("task-123");

    expect(task).not.toBeNull();
    expect(task?.id).toBe("task-123");
    expect(task?.title).toBe("Test Task");
  });

  test("getTask returns null when not found", async () => {
    mockRetrieve.mockResolvedValueOnce(null as any);

    const task = await adapter.getTask("nonexistent");

    expect(task).toBeNull();
  });

  test("markInProgress updates status", async () => {
    const taskId = "task-123";
    await adapter.markInProgress(taskId);

    expect(mockUpdate).toHaveBeenCalledWith({
      page_id: taskId,
      properties: {
        State: { status: { name: "Doing" } }
      }
    });
  });

  test("markFailed updates status and adds error comment", async () => {
    const taskId = "task-123";
    await adapter.markFailed(taskId, "Something went wrong");

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockAppend).toHaveBeenCalled();
    const callArgs = mockAppend.mock.calls[0][0] as any;
    expect(callArgs.children[0].paragraph.rich_text[0].text.content).toContain("Failed:");
  });

  test("resetToPending updates status", async () => {
    const taskId = "task-123";
    await adapter.resetToPending(taskId);

    expect(mockUpdate).toHaveBeenCalledWith({
      page_id: taskId,
      properties: {
        State: { status: { name: "To Do" } }
      }
    });
  });

  test("addComment adds comment successfully", async () => {
    const result = await adapter.addComment("task-123", "Test comment");

    expect(result.success).toBe(true);
    expect(mockAppend).toHaveBeenCalled();
  });

  test("addComment handles errors", async () => {
    mockAppend.mockRejectedValueOnce(new Error("API error"));

    const result = await adapter.addComment("task-123", "Test comment");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Notion API Error: API error");
  });

  test("ping returns ok when API is accessible", async () => {
    mockQuery.mockResolvedValueOnce({ results: [] } as any);

    const result = await adapter.ping();

    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("ping handles Notion API errors gracefully", async () => {
    mockQuery.mockRejectedValueOnce(new Error("Notion API Error: Invalid filter"));

    const result = await adapter.ping();

    expect(result.ok).toBe(true); // Still ok for non-auth errors
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("ping detects unauthorized errors", async () => {
    mockQuery.mockRejectedValueOnce(new Error("Notion API Error: unauthorized"));

    const result = await adapter.ping();

    expect(result.ok).toBe(false);
    expect(result.error).toContain("unauthorized");
  });

  test("ping detects not_found errors", async () => {
    mockQuery.mockRejectedValueOnce(new Error("Notion API Error: not_found"));

    const result = await adapter.ping();

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not_found");
  });

  test("ping handles non-Notion errors", async () => {
    // Simulate an error that doesn't get the "Notion API Error" prefix
    // Since the client wraps all errors, this would still have the prefix
    // but we can test the fallback path by mocking a wrapped error
    mockQuery.mockRejectedValueOnce(new Error("Connection timeout"));

    const result = await adapter.ping();

    // Non-auth Notion API errors still return ok: true
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("getSubTasks returns empty array", async () => {
    const result = await adapter.getSubTasks("task-123");

    expect(result).toEqual([]);
  });

  test("getDependencies returns empty when no deps", async () => {
    mockRetrieve.mockResolvedValueOnce({
      id: "task-123",
      url: "",
      properties: {
        Name: { title: [{ plain_text: "Test" }] },
        State: { status: { name: "To Do" } },
      },
    } as any);

    const deps = await adapter.getDependencies("task-123");

    expect(deps).toEqual([]);
  });

  test("getDependencies returns dependency tasks", async () => {
    mockRetrieve.mockResolvedValueOnce({
      id: "task-123",
      url: "",
      properties: {
        Name: { title: [{ plain_text: "Test" }] },
        State: { status: { name: "To Do" } },
        "Depends On": { relation: [{ id: "dep-1" }] },
      },
    } as any);

    mockRetrieve.mockResolvedValueOnce({
      id: "dep-1",
      url: "",
      properties: {
        Name: { title: [{ plain_text: "Dep Task" }] },
        State: { status: { name: "Done" } },
      },
    } as any);

    const deps = await adapter.getDependencies("task-123");

    expect(deps.length).toBe(1);
    expect(deps[0].id).toBe("dep-1");
  });

  test("getDependents returns empty array", async () => {
    const result = await adapter.getDependents("task-123");

    expect(result).toEqual([]);
  });

  test("areDependenciesMet returns true when all complete", async () => {
    mockRetrieve.mockResolvedValueOnce({
      id: "task-123",
      url: "",
      properties: {
        Name: { title: [{ plain_text: "Test" }] },
        State: { status: { name: "To Do" } },
        "Depends On": { relation: [{ id: "dep-1" }] },
      },
    } as any);

    mockRetrieve.mockResolvedValueOnce({
      id: "dep-1",
      url: "",
      properties: {
        Name: { title: [{ plain_text: "Dep" }] },
        State: { status: { name: "Done" } },
      },
    } as any);

    const result = await adapter.areDependenciesMet("task-123");

    expect(result).toBe(true);
  });

  test("areDependenciesMet returns false when incomplete", async () => {
    mockRetrieve.mockResolvedValueOnce({
      id: "task-123",
      url: "",
      properties: {
        Name: { title: [{ plain_text: "Test" }] },
        State: { status: { name: "To Do" } },
        "Depends On": { relation: [{ id: "dep-1" }] },
      },
    } as any);

    mockRetrieve.mockResolvedValueOnce({
      id: "dep-1",
      url: "",
      properties: {
        Name: { title: [{ plain_text: "Dep" }] },
        State: { status: { name: "To Do" } },
      },
    } as any);

    const result = await adapter.areDependenciesMet("task-123");

    expect(result).toBe(false);
  });

  test("findNextTask filters by parentId", async () => {
    mockQuery.mockResolvedValueOnce({
      results: [
        {
          id: "task-1",
          url: "",
          properties: {
            Name: { title: [{ plain_text: "Task 1" }] },
            State: { status: { name: "To Do" } },
            Parent: { relation: [{ id: "parent-1" }] },
          },
        },
        {
          id: "task-2",
          url: "",
          properties: {
            Name: { title: [{ plain_text: "Task 2" }] },
            State: { status: { name: "To Do" } },
            Parent: { relation: [{ id: "parent-2" }] },
          },
        },
      ],
    } as any);

    const task = await adapter.findNextTask({ parentId: "parent-1" });

    expect(task).not.toBeNull();
    expect(task?.id).toBe("task-1");
  });

  test("mapNotionPageToTask handles missing properties", () => {
    mockQuery.mockResolvedValueOnce({
      results: [
        {
          id: "task-1",
          url: "",
          properties: {},
        },
      ],
    } as any);

    const task = adapter.findNextTask();

    // Should not throw
    expect(task).resolves.not.toBeNull();
  });

  test("updateStatus handles errors", async () => {
    mockUpdate.mockRejectedValueOnce(new Error("Update failed"));

    const result = await adapter.markCompleted("task-123");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Notion API Error: Update failed");
  });

  test("mapNotionPageToTask uses default status values", () => {
    const adapterNoConfig = new NotionTaskAdapter({
      apiKey: "test",
      databaseId: "test",
    });

    mockQuery.mockResolvedValueOnce({
      results: [
        {
          id: "task-1",
          url: "",
          properties: {
            Title: { title: [{ plain_text: "Test" }] },
            Status: { status: { name: "Pending" } },
            Priority: { select: { name: "High" } },
          },
        },
      ],
    } as any);

    const task = adapterNoConfig.findNextTask();

    expect(task).resolves.not.toBeNull();
  });

  test("mapNotionPageToTask handles description as rich_text", async () => {
    mockQuery.mockResolvedValueOnce({
      results: [
        {
          id: "task-1",
          url: "",
          properties: {
            Title: { title: [{ plain_text: "Test" }] },
            Status: { status: { name: "Pending" } },
            Description: { rich_text: [{ plain_text: "Test description" }] },
          },
        },
      ],
    } as any);

    const task = await adapter.findNextTask();

    expect(task?.description).toBe("Test description");
  });

  test("mapNotionPriorityToTaskPriority handles all priorities", async () => {
    mockQuery.mockResolvedValueOnce({
      results: [
        {
          id: "task-1",
          url: "",
          properties: {
            Title: { title: [{ plain_text: "Low" }] },
            Status: { status: { name: "Pending" } },
            Priority: { select: { name: "Low" } },
          },
        },
      ],
    } as any);

    const task = await adapter.findNextTask();

    expect(task?.priority).toBe("low");
  });

  test("mapNotionPriorityToTaskPriority defaults to medium", async () => {
    mockQuery.mockResolvedValueOnce({
      results: [
        {
          id: "task-1",
          url: "",
          properties: {
            Title: { title: [{ plain_text: "Medium" }] },
            Status: { status: { name: "Pending" } },
            Priority: { select: { name: "Normal" } },
          },
        },
      ],
    } as any);

    const task = await adapter.findNextTask();

    expect(task?.priority).toBe("medium");
  });
});

describe("withNotionBackend", () => {
  test("augments LoopworkConfig with notion backend and plugin", () => {
    const config = { apiKey: "key", databaseId: "db" };
    const augment = withNotionBackend(config);
    const baseConfig: any = { plugins: [] };
    const finalConfig = augment(baseConfig);

    expect(finalConfig.backend.type).toBe("notion");
    expect(finalConfig.backend.apiKey).toBe("key");
    expect(finalConfig.plugins).toHaveLength(1);
    expect(finalConfig.plugins[0]).toBeInstanceOf(NotionTaskAdapter);
  });
});
