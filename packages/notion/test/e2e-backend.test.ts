import { expect, test, describe, beforeEach, mock } from 'bun:test';
// Removed type-only import from '../src/adapter';
import type { NotionBackendConfig } from "../src/types";

// Mock the Notion client
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

describe("Notion Backend E2E Tests", () => {
  let adapter: NotionTaskAdapter;
  const config: NotionBackendConfig = {
    apiKey: "test-api-key",
    databaseId: "test-db-id",
    properties: {
      title: "Title",
      status: "Status",
      priority: "Priority",
      description: "Description",
      feature: "Feature",
      parentId: "Parent",
      dependsOn: "Depends On",
    },
    statusValues: {
      pending: "Pending",
      inProgress: "In Progress",
      completed: "Completed",
      failed: "Failed",
    },
  };

  beforeEach(() => {
    adapter = new NotionTaskAdapter(config);
    mockQuery.mockClear();
    mockUpdate.mockClear();
    mockRetrieve.mockClear();
    mockAppend.mockClear();
  });

  describe("TaskBackend Interface Implementation", () => {
    test("findNextTask returns highest priority pending task", async () => {
      mockQuery.mockResolvedValueOnce({
        results: [
          {
            id: "task-high",
            url: "https://notion.so/task-high",
            properties: {
              Title: { title: [{ plain_text: "High Priority Task" }] },
              Status: { status: { name: "Pending" } },
              Priority: { select: { name: "High" } },
              Description: { rich_text: [{ plain_text: "Task description" }] },
            },
          },
          {
            id: "task-low",
            url: "https://notion.so/task-low",
            properties: {
              Title: { title: [{ plain_text: "Low Priority Task" }] },
              Status: { status: { name: "Pending" } },
              Priority: { select: { name: "Low" } },
            },
          },
        ],
      } as any);

      const task = await adapter.findNextTask();

      expect(task).not.toBeNull();
      expect(task?.id).toBe("task-high");
      expect(task?.priority).toBe("high");
      expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
        database_id: "test-db-id",
        filter: {
          property: "Status",
          status: { equals: "Pending" },
        },
      }));
    });

    test("findNextTask filters by feature", async () => {
      mockQuery.mockResolvedValueOnce({
        results: [
          {
            id: "task-1",
            url: "",
            properties: {
              Title: { title: [{ plain_text: "Auth Task" }] },
              Status: { status: { name: "Pending" } },
              Feature: { select: { name: "auth" } },
            },
          },
        ],
      } as any);

      const task = await adapter.findNextTask({ feature: "auth" });

      expect(task?.feature).toBe("auth");
    });

    test("findNextTask filters by parentId", async () => {
      mockQuery.mockResolvedValueOnce({
        results: [
          {
            id: "subtask-1",
            url: "",
            properties: {
              Title: { title: [{ plain_text: "Subtask" }] },
              Status: { status: { name: "Pending" } },
              Parent: { relation: [{ id: "parent-123" }] },
            },
          },
        ],
      } as any);

      const task = await adapter.findNextTask({ parentId: "parent-123" });

      expect(task?.parentId).toBe("parent-123");
    });

    test("getTask retrieves task by ID", async () => {
      mockRetrieve.mockResolvedValueOnce({
        id: "task-123",
        url: "https://notion.so/task-123",
        properties: {
          Title: { title: [{ plain_text: "Test Task" }] },
          Status: { status: { name: "Pending" } },
          Priority: { select: { name: "Medium" } },
          Description: { rich_text: [{ plain_text: "Test description" }] },
        },
      } as any);

      const task = await adapter.getTask("task-123");

      expect(task).not.toBeNull();
      expect(task?.id).toBe("task-123");
      expect(task?.title).toBe("Test Task");
      expect(task?.description).toBe("Test description");
      expect(mockRetrieve).toHaveBeenCalledWith({ page_id: "task-123" });
    });

    test("getTask returns null when not found", async () => {
      mockRetrieve.mockResolvedValueOnce(null as any);

      const task = await adapter.getTask("nonexistent");

      expect(task).toBeNull();
    });

    test("listPendingTasks returns all pending tasks", async () => {
      mockQuery.mockResolvedValueOnce({
        results: [
          {
            id: "task-1",
            url: "",
            properties: {
              Title: { title: [{ plain_text: "Task 1" }] },
              Status: { status: { name: "Pending" } },
            },
          },
          {
            id: "task-2",
            url: "",
            properties: {
              Title: { title: [{ plain_text: "Task 2" }] },
              Status: { status: { name: "Pending" } },
            },
          },
        ],
      } as any);

      const tasks = await adapter.listPendingTasks();

      expect(tasks.length).toBe(2);
      expect(tasks[0].status).toBe("pending");
      expect(tasks[1].status).toBe("pending");
    });

    test("listPendingTasks returns empty array when no results", async () => {
      mockQuery.mockResolvedValueOnce(null as any);

      const tasks = await adapter.listPendingTasks();

      expect(tasks).toEqual([]);
    });

    test("countPending returns correct count", async () => {
      mockQuery.mockResolvedValueOnce({
        results: [
          { id: "1", url: "", properties: { Title: { title: [{ plain_text: "Task 1" }] }, Status: { status: { name: "Pending" } } } },
          { id: "2", url: "", properties: { Title: { title: [{ plain_text: "Task 2" }] }, Status: { status: { name: "Pending" } } } },
          { id: "3", url: "", properties: { Title: { title: [{ plain_text: "Task 3" }] }, Status: { status: { name: "Pending" } } } },
        ],
      } as any);

      const count = await adapter.countPending();

      expect(count).toBe(3);
    });

    test("countPending with feature filter", async () => {
      mockQuery.mockResolvedValueOnce({
        results: [
          {
            id: "1",
            url: "",
            properties: {
              Title: { title: [{ plain_text: "Task 1" }] },
              Status: { status: { name: "Pending" } },
              Feature: { select: { name: "auth" } },
            },
          },
        ],
      } as any);

      const count = await adapter.countPending({ feature: "auth" });

      expect(count).toBe(1);
    });
  });

  describe("Status Transitions", () => {
    test("markInProgress updates status to In Progress", async () => {
      const result = await adapter.markInProgress("task-123");

      expect(result.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        page_id: "task-123",
        properties: {
          Status: {
            status: {
              name: "In Progress",
            },
          },
        },
      });
    });

    test("markCompleted updates status to Completed", async () => {
      const result = await adapter.markCompleted("task-123");

      expect(result.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        page_id: "task-123",
        properties: {
          Status: {
            status: {
              name: "Completed",
            },
          },
        },
      });
    });

    test("markCompleted adds comment when provided", async () => {
      const result = await adapter.markCompleted("task-123", "Task finished successfully");

      expect(result.success).toBe(true);
      expect(mockAppend).toHaveBeenCalled();
      const appendCall = mockAppend.mock.calls[0][0] as any;
      expect(appendCall.block_id).toBe("task-123");
      expect(appendCall.children[0].paragraph.rich_text[0].text.content).toBe("Task finished successfully");
    });

    test("markFailed updates status to Failed and adds error comment", async () => {
      const result = await adapter.markFailed("task-123", "Build failed");

      expect(result.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        page_id: "task-123",
        properties: {
          Status: {
            status: {
              name: "Failed",
            },
          },
        },
      });
      expect(mockAppend).toHaveBeenCalled();
      const appendCall = mockAppend.mock.calls[0][0] as any;
      expect(appendCall.children[0].paragraph.rich_text[0].text.content).toContain("Failed: Build failed");
    });

    test("resetToPending updates status to Pending", async () => {
      const result = await adapter.resetToPending("task-123");

      expect(result.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        page_id: "task-123",
        properties: {
          Status: {
            status: {
              name: "Pending",
            },
          },
        },
      });
    });

    test("status update handles errors", async () => {
      mockUpdate.mockRejectedValueOnce(new Error("API error"));

      const result = await adapter.markInProgress("task-123");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Notion API Error: API error");
    });
  });

  describe("Notion Property Mapping", () => {
    test("maps Title property correctly", async () => {
      mockQuery.mockResolvedValueOnce({
        results: [
          {
            id: "task-1",
            url: "",
            properties: {
              Title: { title: [{ plain_text: "My Task" }] },
              Status: { status: { name: "Pending" } },
            },
          },
        ],
      } as any);

      const task = await adapter.findNextTask();

      expect(task?.title).toBe("My Task");
    });

    test("maps Status property correctly", async () => {
      mockRetrieve.mockResolvedValueOnce({
        id: "task-1",
        url: "",
        properties: {
          Title: { title: [{ plain_text: "Task" }] },
          Status: { status: { name: "In Progress" } },
        },
      } as any);

      const task = await adapter.getTask("task-1");

      expect(task?.status).toBe("in-progress");
    });

    test("maps Priority property correctly", async () => {
      mockRetrieve.mockResolvedValueOnce({
        id: "task-1",
        url: "",
        properties: {
          Title: { title: [{ plain_text: "Task" }] },
          Status: { status: { name: "Pending" } },
          Priority: { select: { name: "Low" } },
        },
      } as any);

      const task = await adapter.getTask("task-1");

      expect(task?.priority).toBe("low");
    });

    test("maps Description property (rich_text)", async () => {
      mockRetrieve.mockResolvedValueOnce({
        id: "task-1",
        url: "",
        properties: {
          Title: { title: [{ plain_text: "Task" }] },
          Status: { status: { name: "Pending" } },
          Description: { rich_text: [{ plain_text: "This is a description" }] },
        },
      } as any);

      const task = await adapter.getTask("task-1");

      expect(task?.description).toBe("This is a description");
    });

    test("maps Feature property (select)", async () => {
      mockRetrieve.mockResolvedValueOnce({
        id: "task-1",
        url: "",
        properties: {
          Title: { title: [{ plain_text: "Task" }] },
          Status: { status: { name: "Pending" } },
          Feature: { select: { name: "authentication" } },
        },
      } as any);

      const task = await adapter.getTask("task-1");

      expect(task?.feature).toBe("authentication");
    });

    test("maps Feature property (rich_text fallback)", async () => {
      mockRetrieve.mockResolvedValueOnce({
        id: "task-1",
        url: "",
        properties: {
          Title: { title: [{ plain_text: "Task" }] },
          Status: { status: { name: "Pending" } },
          Feature: { rich_text: [{ plain_text: "ui-components" }] },
        },
      } as any);

      const task = await adapter.getTask("task-1");

      expect(task?.feature).toBe("ui-components");
    });

    test("maps Parent property (relation)", async () => {
      mockRetrieve.mockResolvedValueOnce({
        id: "task-1",
        url: "",
        properties: {
          Title: { title: [{ plain_text: "Task" }] },
          Status: { status: { name: "Pending" } },
          Parent: { relation: [{ id: "parent-abc" }] },
        },
      } as any);

      const task = await adapter.getTask("task-1");

      expect(task?.parentId).toBe("parent-abc");
    });

    test("maps Depends On property (relation array)", async () => {
      mockRetrieve.mockResolvedValueOnce({
        id: "task-1",
        url: "",
        properties: {
          Title: { title: [{ plain_text: "Task" }] },
          Status: { status: { name: "Pending" } },
          "Depends On": { relation: [{ id: "dep-1" }, { id: "dep-2" }] },
        },
      } as any);

      const task = await adapter.getTask("task-1");

      expect(task?.dependsOn).toEqual(["dep-1", "dep-2"]);
    });

    test("handles missing properties gracefully", async () => {
      mockRetrieve.mockResolvedValueOnce({
        id: "task-1",
        url: "",
        properties: {},
      } as any);

      const task = await adapter.getTask("task-1");

      expect(task?.title).toBe("Untitled");
      expect(task?.description).toBe("");
      expect(task?.status).toBe("pending");
      expect(task?.priority).toBe("medium");
    });

    test("includes Notion URL in metadata", async () => {
      mockRetrieve.mockResolvedValueOnce({
        id: "task-1",
        url: "https://www.notion.so/workspace/page-123",
        properties: {
          Title: { title: [{ plain_text: "Task" }] },
          Status: { status: { name: "Pending" } },
        },
      } as any);

      const task = await adapter.getTask("task-1");

      expect(task?.metadata?.notionUrl).toBe("https://www.notion.so/workspace/page-123");
    });
  });

  describe("Status Value Mapping", () => {
    test("maps Pending status", async () => {
      mockRetrieve.mockResolvedValueOnce({
        id: "task-1",
        url: "",
        properties: {
          Title: { title: [{ plain_text: "Task" }] },
          Status: { status: { name: "Pending" } },
        },
      } as any);

      const task = await adapter.getTask("task-1");

      expect(task?.status).toBe("pending");
    });

    test("maps In Progress status", async () => {
      mockRetrieve.mockResolvedValueOnce({
        id: "task-1",
        url: "",
        properties: {
          Title: { title: [{ plain_text: "Task" }] },
          Status: { status: { name: "In Progress" } },
        },
      } as any);

      const task = await adapter.getTask("task-1");

      expect(task?.status).toBe("in-progress");
    });

    test("maps Completed status", async () => {
      mockRetrieve.mockResolvedValueOnce({
        id: "task-1",
        url: "",
        properties: {
          Title: { title: [{ plain_text: "Task" }] },
          Status: { status: { name: "Completed" } },
        },
      } as any);

      const task = await adapter.getTask("task-1");

      expect(task?.status).toBe("completed");
    });

    test("maps Failed status", async () => {
      mockRetrieve.mockResolvedValueOnce({
        id: "task-1",
        url: "",
        properties: {
          Title: { title: [{ plain_text: "Task" }] },
          Status: { status: { name: "Failed" } },
        },
      } as any);

      const task = await adapter.getTask("task-1");

      expect(task?.status).toBe("failed");
    });

    test("maps unknown status to pending", async () => {
      mockRetrieve.mockResolvedValueOnce({
        id: "task-1",
        url: "",
        properties: {
          Title: { title: [{ plain_text: "Task" }] },
          Status: { status: { name: "On Hold" } },
        },
      } as any);

      const task = await adapter.getTask("task-1");

      expect(task?.status).toBe("pending");
    });
  });

  describe("Dependencies", () => {
    test("getDependencies returns empty when no dependencies", async () => {
      mockRetrieve.mockResolvedValueOnce({
        id: "task-1",
        url: "",
        properties: {
          Title: { title: [{ plain_text: "Task" }] },
          Status: { status: { name: "Pending" } },
        },
      } as any);

      const deps = await adapter.getDependencies("task-1");

      expect(deps).toEqual([]);
    });

    test("getDependencies returns dependency tasks", async () => {
      mockRetrieve.mockResolvedValueOnce({
        id: "task-1",
        url: "",
        properties: {
          Title: { title: [{ plain_text: "Task" }] },
          Status: { status: { name: "Pending" } },
          "Depends On": { relation: [{ id: "dep-1" }, { id: "dep-2" }] },
        },
      } as any);

      mockRetrieve.mockResolvedValueOnce({
        id: "dep-1",
        url: "",
        properties: {
          Title: { title: [{ plain_text: "Dependency 1" }] },
          Status: { status: { name: "Completed" } },
        },
      } as any);

      mockRetrieve.mockResolvedValueOnce({
        id: "dep-2",
        url: "",
        properties: {
          Title: { title: [{ plain_text: "Dependency 2" }] },
          Status: { status: { name: "Completed" } },
        },
      } as any);

      const deps = await adapter.getDependencies("task-1");

      expect(deps.length).toBe(2);
      expect(deps[0].id).toBe("dep-1");
      expect(deps[1].id).toBe("dep-2");
    });

    test("areDependenciesMet returns true when all dependencies complete", async () => {
      mockRetrieve.mockResolvedValueOnce({
        id: "task-1",
        url: "",
        properties: {
          Title: { title: [{ plain_text: "Task" }] },
          Status: { status: { name: "Pending" } },
          "Depends On": { relation: [{ id: "dep-1" }] },
        },
      } as any);

      mockRetrieve.mockResolvedValueOnce({
        id: "dep-1",
        url: "",
        properties: {
          Title: { title: [{ plain_text: "Dep" }] },
          Status: { status: { name: "Completed" } },
        },
      } as any);

      const met = await adapter.areDependenciesMet("task-1");

      expect(met).toBe(true);
    });

    test("areDependenciesMet returns false when dependencies incomplete", async () => {
      mockRetrieve.mockResolvedValueOnce({
        id: "task-1",
        url: "",
        properties: {
          Title: { title: [{ plain_text: "Task" }] },
          Status: { status: { name: "Pending" } },
          "Depends On": { relation: [{ id: "dep-1" }] },
        },
      } as any);

      mockRetrieve.mockResolvedValueOnce({
        id: "dep-1",
        url: "",
        properties: {
          Title: { title: [{ plain_text: "Dep" }] },
          Status: { status: { name: "Pending" } },
        },
      } as any);

      const met = await adapter.areDependenciesMet("task-1");

      expect(met).toBe(false);
    });
  });

  describe("Comments", () => {
    test("addComment adds comment successfully", async () => {
      const result = await adapter.addComment("task-123", "Progress update");

      expect(result.success).toBe(true);
      expect(mockAppend).toHaveBeenCalled();
      const appendCall = mockAppend.mock.calls[0][0] as any;
      expect(appendCall.block_id).toBe("task-123");
      expect(appendCall.children[0].paragraph.rich_text[0].text.content).toBe("Progress update");
    });

    test("addComment handles errors", async () => {
      mockAppend.mockRejectedValueOnce(new Error("Permission denied"));

      const result = await adapter.addComment("task-123", "Comment");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Notion API Error: Permission denied");
    });
  });

  describe("Ping", () => {
    test("ping returns ok when API accessible", async () => {
      mockQuery.mockResolvedValueOnce({ results: [] } as any);

      const result = await adapter.ping();

      expect(result.ok).toBe(true);
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

    test("ping returns ok for non-auth API errors", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Notion API Error: Invalid filter"));

      const result = await adapter.ping();

      expect(result.ok).toBe(true);
    });
  });

  describe("Custom Configuration", () => {
    test("uses default property names when not configured", async () => {
      const defaultAdapter = new NotionTaskAdapter({
        apiKey: "test",
        databaseId: "test",
      });

      mockQuery.mockResolvedValueOnce({
        results: [
          {
            id: "task-1",
            url: "",
            properties: {
              Title: { title: [{ plain_text: "Task" }] },
              Status: { status: { name: "Pending" } },
            },
          },
        ],
      } as any);

      const task = await defaultAdapter.findNextTask();

      expect(task?.title).toBe("Task");
      expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
        filter: {
          property: "Status",
          status: { equals: "Pending" },
        },
      }));
    });

    test("uses default status values when not configured", async () => {
      const defaultAdapter = new NotionTaskAdapter({
        apiKey: "test",
        databaseId: "test",
      });

      await defaultAdapter.markInProgress("task-123");

      expect(mockUpdate).toHaveBeenCalledWith({
        page_id: "task-123",
        properties: {
          Status: {
            status: {
              name: "In Progress",
            },
          },
        },
      });
    });
  });
});
