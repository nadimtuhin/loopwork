import { expect, test, describe, beforeEach, mock } from "bun:test";
import { TrelloTaskAdapter } from "../src/adapter";
import type { TrelloBackendConfig, TrelloList, TrelloCard } from "../src/types";

// Mock fetch for Trello API
const mockFetch = mock((url: string) => {
  return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
});

global.fetch = mockFetch as any;

describe("Trello Backend E2E Tests", () => {
  let adapter: TrelloTaskAdapter;
  const config: TrelloBackendConfig = {
    apiKey: "test-api-key",
    token: "test-token",
    boardId: "board-123",
    lists: {
      pending: "To Do",
      inProgress: "Doing",
      completed: "Done",
      failed: "Failed",
    },
  };

  const mockLists: TrelloList[] = [
    { id: "list-todo", name: "To Do", closed: false, idBoard: "board-123" },
    { id: "list-doing", name: "Doing", closed: false, idBoard: "board-123" },
    { id: "list-done", name: "Done", closed: false, idBoard: "board-123" },
    { id: "list-failed", name: "Failed", closed: false, idBoard: "board-123" },
  ];

  beforeEach(() => {
    adapter = new TrelloTaskAdapter(config);
    mockFetch.mockClear();
  });

  describe("TaskBackend Interface Implementation", () => {
    test("findNextTask returns first pending task", async () => {
      // Mock getLists call (ensureLists)
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockLists), { status: 200 })
      );

      // Mock getCardsInList call
      const mockCards: TrelloCard[] = [
        {
          id: "card-1",
          name: "First Task",
          desc: "Task description",
          idList: "list-todo",
          idBoard: "board-123",
          url: "https://trello.com/c/card-1",
          labels: [
            { id: "label-1", idBoard: "board-123", name: "high", color: "red" },
          ],
        },
        {
          id: "card-2",
          name: "Second Task",
          desc: "",
          idList: "list-todo",
          idBoard: "board-123",
          url: "https://trello.com/c/card-2",
          labels: [],
        },
      ];
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockCards), { status: 200 })
      );

      const task = await adapter.findNextTask();

      expect(task).not.toBeNull();
      expect(task?.id).toBe("card-1");
      expect(task?.title).toBe("First Task");
      expect(task?.priority).toBe("high");
    });

    test("findNextTask filters by feature", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockLists), { status: 200 })
      );

      const mockCards: TrelloCard[] = [
        {
          id: "card-1",
          name: "Auth Task",
          desc: "",
          idList: "list-todo",
          idBoard: "board-123",
          url: "https://trello.com/c/card-1",
          labels: [
            { id: "label-1", idBoard: "board-123", name: "feat:auth", color: "blue" },
          ],
        },
        {
          id: "card-2",
          name: "UI Task",
          desc: "",
          idList: "list-todo",
          idBoard: "board-123",
          url: "https://trello.com/c/card-2",
          labels: [
            { id: "label-2", idBoard: "board-123", name: "feat:ui", color: "green" },
          ],
        },
      ];
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockCards), { status: 200 })
      );

      const task = await adapter.findNextTask({ feature: "auth" });

      expect(task?.id).toBe("card-1");
      expect(task?.feature).toBe("auth");
    });

    test("findNextTask filters by priority", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockLists), { status: 200 })
      );

      const mockCards: TrelloCard[] = [
        {
          id: "card-low",
          name: "Low Priority",
          desc: "",
          idList: "list-todo",
          idBoard: "board-123",
          url: "https://trello.com/c/card-low",
          labels: [
            { id: "label-1", idBoard: "board-123", name: "low", color: "yellow" },
          ],
        },
        {
          id: "card-high",
          name: "High Priority",
          desc: "",
          idList: "list-todo",
          idBoard: "board-123",
          url: "https://trello.com/c/card-high",
          labels: [
            { id: "label-2", idBoard: "board-123", name: "high", color: "red" },
          ],
        },
      ];
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockCards), { status: 200 })
      );

      const task = await adapter.findNextTask({ priority: "high" });

      expect(task?.id).toBe("card-high");
    });

    test("getTask retrieves card by ID", async () => {
      // Initialize lists first
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockLists), { status: 200 })
      );
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 })
      );
      await adapter.listPendingTasks();

      const mockCard: TrelloCard = {
        id: "card-123",
        name: "Test Card",
        desc: "Card description",
        idList: "list-todo",
        idBoard: "board-123",
        url: "https://trello.com/c/card-123",
        labels: [
          { id: "label-1", idBoard: "board-123", name: "high", color: "red" },
        ],
      };

      // Call for getCard
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockCard), { status: 200 })
      );

      const task = await adapter.getTask("card-123");

      expect(task).not.toBeNull();
      expect(task?.id).toBe("card-123");
      expect(task?.title).toBe("Test Card");
      expect(task?.description).toBe("Card description");
    });

    test("getTask returns null on error", async () => {
      // Initialize lists
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockLists), { status: 200 })
      );
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 })
      );
      await adapter.listPendingTasks();

      mockFetch.mockRejectedValueOnce(new Error("Not found"));

      const task = await adapter.getTask("nonexistent");

      expect(task).toBeNull();
    });

    test("listPendingTasks returns all cards in To Do list", async () => {
      // Clear any previous state
      adapter = new TrelloTaskAdapter(config);

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockLists), { status: 200 })
      );

      const mockCards: TrelloCard[] = [
        {
          id: "card-1",
          name: "Task 1",
          desc: "",
          idList: "list-todo",
          idBoard: "board-123",
          url: "https://trello.com/c/card-1",
          labels: [],
        },
        {
          id: "card-2",
          name: "Task 2",
          desc: "",
          idList: "list-todo",
          idBoard: "board-123",
          url: "https://trello.com/c/card-2",
          labels: [],
        },
      ];
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockCards), { status: 200 })
      );

      const tasks = await adapter.listPendingTasks();

      expect(tasks.length).toBe(2);
      expect(tasks[0].status).toBe("pending");
      expect(tasks[1].status).toBe("pending");
    });

    test("countPending returns correct count", async () => {
      // Clear state
      adapter = new TrelloTaskAdapter(config);

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockLists), { status: 200 })
      );

      const mockCards: TrelloCard[] = [
        { id: "1", name: "Task 1", desc: "", idList: "list-todo", idBoard: "board-123", url: "", labels: [] },
        { id: "2", name: "Task 2", desc: "", idList: "list-todo", idBoard: "board-123", url: "", labels: [] },
        { id: "3", name: "Task 3", desc: "", idList: "list-todo", idBoard: "board-123", url: "", labels: [] },
      ];
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockCards), { status: 200 })
      );

      const count = await adapter.countPending();

      expect(count).toBe(3);
    });
  });

  describe("Status Transitions via List Moves", () => {
    beforeEach(async () => {
      // Reinitialize adapter to clear state
      adapter = new TrelloTaskAdapter(config);
      // Initialize lists
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockLists), { status: 200 })
      );
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 })
      );
      await adapter.listPendingTasks(); // Trigger ensureLists
    });

    test("markInProgress moves card to Doing list", async () => {
      const updatedCard: TrelloCard = {
        id: "card-123",
        name: "Task",
        desc: "",
        idList: "list-doing",
        idBoard: "board-123",
        url: "https://trello.com/c/card-123",
        labels: [],
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(updatedCard), { status: 200 })
      );

      const result = await adapter.markInProgress("card-123");

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/cards/card-123"),
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ idList: "list-doing" }),
        })
      );
    });

    test("markCompleted moves card to Done list", async () => {
      const updatedCard: TrelloCard = {
        id: "card-123",
        name: "Task",
        desc: "",
        idList: "list-done",
        idBoard: "board-123",
        url: "https://trello.com/c/card-123",
        labels: [],
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(updatedCard), { status: 200 })
      );

      const result = await adapter.markCompleted("card-123");

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/cards/card-123"),
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ idList: "list-done" }),
        })
      );
    });

    test("markCompleted adds comment when provided", async () => {
      const updatedCard: TrelloCard = {
        id: "card-123",
        name: "Task",
        desc: "",
        idList: "list-done",
        idBoard: "board-123",
        url: "https://trello.com/c/card-123",
        labels: [],
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(updatedCard), { status: 200 })
      );
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200 })
      );

      const result = await adapter.markCompleted("card-123", "Finished successfully");

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/cards/card-123/actions/comments"),
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    test("markFailed moves card to Failed list", async () => {
      const updatedCard: TrelloCard = {
        id: "card-123",
        name: "Task",
        desc: "",
        idList: "list-failed",
        idBoard: "board-123",
        url: "https://trello.com/c/card-123",
        labels: [],
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(updatedCard), { status: 200 })
      );
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200 })
      );

      const result = await adapter.markFailed("card-123", "Build error");

      expect(result.success).toBe(true);
    });

    test("markFailed adds error comment", async () => {
      const updatedCard: TrelloCard = {
        id: "card-123",
        name: "Task",
        desc: "",
        idList: "list-failed",
        idBoard: "board-123",
        url: "https://trello.com/c/card-123",
        labels: [],
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(updatedCard), { status: 200 })
      );
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200 })
      );

      const result = await adapter.markFailed("card-123", "Build error");

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/cards/card-123/actions/comments"),
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    test("markFailed succeeds even if Failed list does not exist", async () => {
      // Use adapter without Failed list configured
      const adapterNoFailed = new TrelloTaskAdapter({
        apiKey: "test",
        token: "test",
        boardId: "board-123",
        lists: {
          pending: "To Do",
          inProgress: "Doing",
          completed: "Done",
        },
      });

      const listsNoFailed = mockLists.filter((l) => l.name !== "Failed");
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(listsNoFailed), { status: 200 })
      );
      await adapterNoFailed.listPendingTasks(); // Trigger ensureLists

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200 })
      );

      const result = await adapterNoFailed.markFailed("card-123", "Error");

      expect(result.success).toBe(true);
    });

    test("resetToPending moves card to To Do list", async () => {
      const updatedCard: TrelloCard = {
        id: "card-123",
        name: "Task",
        desc: "",
        idList: "list-todo",
        idBoard: "board-123",
        url: "https://trello.com/c/card-123",
        labels: [],
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(updatedCard), { status: 200 })
      );

      const result = await adapter.resetToPending("card-123");

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/cards/card-123"),
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ idList: "list-todo" }),
        })
      );
    });

    test("status update handles errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await adapter.markInProgress("card-123");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });
  });

  describe("Card-to-Task Mapping", () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockLists), { status: 200 })
      );
      await adapter.listPendingTasks();
    });

    test("maps card name to task title", async () => {
      const card: TrelloCard = {
        id: "card-1",
        name: "Implement login feature",
        desc: "",
        idList: "list-todo",
        idBoard: "board-123",
        url: "https://trello.com/c/card-1",
        labels: [],
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(card), { status: 200 })
      );

      const task = await adapter.getTask("card-1");

      expect(task?.title).toBe("Implement login feature");
    });

    test("maps card desc to task description", async () => {
      const card: TrelloCard = {
        id: "card-1",
        name: "Task",
        desc: "This is a detailed description",
        idList: "list-todo",
        idBoard: "board-123",
        url: "https://trello.com/c/card-1",
        labels: [],
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(card), { status: 200 })
      );

      const task = await adapter.getTask("card-1");

      expect(task?.description).toBe("This is a detailed description");
    });

    test("maps idList to task status - pending", async () => {
      const card: TrelloCard = {
        id: "card-1",
        name: "Task",
        desc: "",
        idList: "list-todo",
        idBoard: "board-123",
        url: "https://trello.com/c/card-1",
        labels: [],
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(card), { status: 200 })
      );

      const task = await adapter.getTask("card-1");

      expect(task?.status).toBe("pending");
    });

    test("maps idList to task status - in-progress", async () => {
      const card: TrelloCard = {
        id: "card-1",
        name: "Task",
        desc: "",
        idList: "list-doing",
        idBoard: "board-123",
        url: "https://trello.com/c/card-1",
        labels: [],
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(card), { status: 200 })
      );

      const task = await adapter.getTask("card-1");

      expect(task?.status).toBe("in-progress");
    });

    test("maps idList to task status - completed", async () => {
      const card: TrelloCard = {
        id: "card-1",
        name: "Task",
        desc: "",
        idList: "list-done",
        idBoard: "board-123",
        url: "https://trello.com/c/card-1",
        labels: [],
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(card), { status: 200 })
      );

      const task = await adapter.getTask("card-1");

      expect(task?.status).toBe("completed");
    });

    test("maps idList to task status - failed", async () => {
      const card: TrelloCard = {
        id: "card-1",
        name: "Task",
        desc: "",
        idList: "list-failed",
        idBoard: "board-123",
        url: "https://trello.com/c/card-1",
        labels: [],
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(card), { status: 200 })
      );

      const task = await adapter.getTask("card-1");

      expect(task?.status).toBe("failed");
    });

    test("maps high label to high priority", async () => {
      const card: TrelloCard = {
        id: "card-1",
        name: "Task",
        desc: "",
        idList: "list-todo",
        idBoard: "board-123",
        url: "https://trello.com/c/card-1",
        labels: [
          { id: "label-1", idBoard: "board-123", name: "high", color: "red" },
        ],
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(card), { status: 200 })
      );

      const task = await adapter.getTask("card-1");

      expect(task?.priority).toBe("high");
    });

    test("maps low label to low priority", async () => {
      const card: TrelloCard = {
        id: "card-1",
        name: "Task",
        desc: "",
        idList: "list-todo",
        idBoard: "board-123",
        url: "https://trello.com/c/card-1",
        labels: [
          { id: "label-1", idBoard: "board-123", name: "low", color: "yellow" },
        ],
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(card), { status: 200 })
      );

      const task = await adapter.getTask("card-1");

      expect(task?.priority).toBe("low");
    });

    test("defaults to medium priority when no priority label", async () => {
      const card: TrelloCard = {
        id: "card-1",
        name: "Task",
        desc: "",
        idList: "list-todo",
        idBoard: "board-123",
        url: "https://trello.com/c/card-1",
        labels: [],
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(card), { status: 200 })
      );

      const task = await adapter.getTask("card-1");

      expect(task?.priority).toBe("medium");
    });

    test("extracts feature from feat: label", async () => {
      const card: TrelloCard = {
        id: "card-1",
        name: "Task",
        desc: "",
        idList: "list-todo",
        idBoard: "board-123",
        url: "https://trello.com/c/card-1",
        labels: [
          { id: "label-1", idBoard: "board-123", name: "feat:authentication", color: "blue" },
        ],
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(card), { status: 200 })
      );

      const task = await adapter.getTask("card-1");

      expect(task?.feature).toBe("authentication");
    });

    test("includes URL and labels in metadata", async () => {
      const card: TrelloCard = {
        id: "card-1",
        name: "Task",
        desc: "",
        idList: "list-todo",
        idBoard: "board-123",
        url: "https://trello.com/c/card-1",
        labels: [
          { id: "label-1", idBoard: "board-123", name: "bug", color: "red" },
          { id: "label-2", idBoard: "board-123", name: "urgent", color: "orange" },
        ],
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(card), { status: 200 })
      );

      const task = await adapter.getTask("card-1");

      expect(task?.metadata?.url).toBe("https://trello.com/c/card-1");
      expect(task?.metadata?.labels).toEqual(["bug", "urgent"]);
    });
  });

  describe("List Discovery and Caching", () => {
    test("ensureLists caches list IDs", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockLists), { status: 200 })
      );

      await adapter.listPendingTasks();

      // Second call should not fetch lists again
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 })
      );

      await adapter.listPendingTasks();

      // Only 2 fetch calls: getLists (once) + getCardsInList (twice)
      expect(mockFetch.mock.calls.length).toBe(3);
    });

    test("ensureLists throws when pending list not found", async () => {
      const listsWithoutPending = mockLists.filter((l) => l.name !== "To Do");
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(listsWithoutPending), { status: 200 })
      );

      await expect(adapter.listPendingTasks()).rejects.toThrow(
        'Pending list "To Do" not found'
      );
    });

    test("ensureLists matches list names case-insensitively", async () => {
      const listsWithDifferentCase = [
        { id: "list-todo", name: "to do", closed: false, idBoard: "board-123" },
        { id: "list-doing", name: "DOING", closed: false, idBoard: "board-123" },
        { id: "list-done", name: "dOnE", closed: false, idBoard: "board-123" },
      ];

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(listsWithDifferentCase), { status: 200 })
      );
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 })
      );

      const tasks = await adapter.listPendingTasks();

      expect(tasks).toEqual([]);
    });

    test("uses default list names when not configured", async () => {
      const defaultAdapter = new TrelloTaskAdapter({
        apiKey: "test",
        token: "test",
        boardId: "board-123",
      });

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockLists), { status: 200 })
      );
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 })
      );

      await defaultAdapter.listPendingTasks();

      // Should have called getLists
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/boards/board-123/lists"),
        expect.any(Object)
      );
    });
  });

  describe("Ping", () => {
    test("ping returns ok when API accessible", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockLists), { status: 200 })
      );

      const result = await adapter.ping();

      expect(result.ok).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    test("ping handles errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

      const result = await adapter.ping();

      expect(result.ok).toBe(false);
      expect(result.error).toBe("Network timeout");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Sub-tasks and Dependencies", () => {
    test("getSubTasks returns empty array", async () => {
      const subtasks = await adapter.getSubTasks("card-123");

      expect(subtasks).toEqual([]);
    });

    test("getDependencies returns empty array", async () => {
      const deps = await adapter.getDependencies("card-123");

      expect(deps).toEqual([]);
    });

    test("getDependents returns empty array", async () => {
      const dependents = await adapter.getDependents("card-123");

      expect(dependents).toEqual([]);
    });

    test("areDependenciesMet returns true", async () => {
      const met = await adapter.areDependenciesMet("card-123");

      expect(met).toBe(true);
    });
  });

  describe("Card Position Sorting", () => {
    test("listPendingTasks sorts cards by position", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockLists), { status: 200 })
      );

      const mockCards = [
        {
          id: "card-3",
          name: "Third",
          desc: "",
          idList: "list-todo",
          idBoard: "board-123",
          url: "",
          labels: [],
          pos: 3000,
        },
        {
          id: "card-1",
          name: "First",
          desc: "",
          idList: "list-todo",
          idBoard: "board-123",
          url: "",
          labels: [],
          pos: 1000,
        },
        {
          id: "card-2",
          name: "Second",
          desc: "",
          idList: "list-todo",
          idBoard: "board-123",
          url: "",
          labels: [],
          pos: 2000,
        },
      ];

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockCards), { status: 200 })
      );

      const tasks = await adapter.listPendingTasks();

      expect(tasks[0].id).toBe("card-1");
      expect(tasks[1].id).toBe("card-2");
      expect(tasks[2].id).toBe("card-3");
    });
  });
});
