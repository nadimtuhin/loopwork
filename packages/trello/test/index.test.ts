import { expect, test, describe, beforeEach, mock } from "bun:test";
import { TrelloClient } from "../src/client";
import { TrelloTaskAdapter } from "../src/adapter";
import type { TrelloList, TrelloCard } from "../src/types";

// Mock fetch
const mockFetch = mock((url: string) => {
  return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
});

global.fetch = mockFetch as any;

describe("TrelloClient", () => {
  const apiKey = "test-api-key";
  const token = "test-token";
  const boardId = "board-123";
  let client: TrelloClient;

  beforeEach(() => {
    client = new TrelloClient(apiKey, token, boardId);
    mockFetch.mockClear();
  });

  test("getLists calls Trello API with correct params", async () => {
    const mockLists: TrelloList[] = [
      { id: "list-1", name: "To Do", closed: false, idBoard: boardId },
      { id: "list-2", name: "Done", closed: false, idBoard: boardId },
    ];

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockLists), { status: 200 })
    );

    const lists = await client.getLists();

    expect(lists).toEqual(mockLists);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/boards/${boardId}/lists`),
      expect.objectContaining({
        method: "GET",
      })
    );
  });

  test("getCardsInList calls Trello API", async () => {
    const mockCards: TrelloCard[] = [
      {
        id: "card-1",
        name: "Task 1",
        desc: "Description",
        idList: "list-1",
        idBoard: boardId,
        url: "https://trello.com/c/card-1",
        labels: [],
      },
    ];

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockCards), { status: 200 })
    );

    const cards = await client.getCardsInList("list-1");

    expect(cards).toEqual(mockCards);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/lists/list-1/cards"),
      expect.objectContaining({
        method: "GET",
      })
    );
  });

  test("moveCard calls Trello API with PUT", async () => {
    const updatedCard: TrelloCard = {
      id: "card-1",
      name: "Task",
      desc: "",
      idList: "list-2",
      idBoard: boardId,
      url: "https://trello.com/c/card-1",
      labels: [],
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(updatedCard), { status: 200 })
    );

    const result = await client.moveCard("card-1", "list-2");

    expect(result).toEqual(updatedCard);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/cards/card-1"),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ idList: "list-2" }),
      })
    );
  });

  test("addComment calls Trello API with POST", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );

    await client.addComment("card-1", "Test comment");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/cards/card-1/actions/comments"),
      expect.objectContaining({
        method: "POST",
      })
    );
    const callUrl = mockFetch.mock.calls[0][0] as string;
    expect(callUrl).toMatch(/text=Test[\+%20]comment/);
  });

  test("getCard calls Trello API", async () => {
    const mockCard: TrelloCard = {
      id: "card-1",
      name: "Task",
      desc: "Description",
      idList: "list-1",
      idBoard: boardId,
      url: "https://trello.com/c/card-1",
      labels: [],
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockCard), { status: 200 })
    );

    const card = await client.getCard("card-1");

    expect(card).toEqual(mockCard);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/cards/card-1"),
      expect.objectContaining({
        method: "GET",
      })
    );
  });

  test("request includes API key and token in query params", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );

    await client.getLists();

    const callUrl = mockFetch.mock.calls[0][0] as string;
    expect(callUrl).toContain(`key=${apiKey}`);
    expect(callUrl).toContain(`token=${token}`);
  });

  test("request throws on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Not found", { status: 404, statusText: "Not Found" })
    );

    await expect(client.getLists()).rejects.toThrow("Trello API error: 404");
  });

  test("request includes Content-Type and Accept headers", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );

    await client.getLists();

    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Accept"]).toBe("application/json");
  });
});

describe("TrelloTaskAdapter", () => {
  const config = {
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

  let adapter: TrelloTaskAdapter;

  beforeEach(() => {
    adapter = new TrelloTaskAdapter(config);
    mockFetch.mockClear();
  });

  test("has correct name", () => {
    expect(adapter.name).toBe("trello");
  });

  test("findNextTask queries pending list", async () => {
    const mockLists: TrelloList[] = [
      { id: "list-todo", name: "To Do", closed: false, idBoard: "board-123" },
    ];

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
    ];

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockLists), { status: 200 })
    );
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockCards), { status: 200 })
    );

    const task = await adapter.findNextTask();

    expect(task).not.toBeNull();
    expect(task?.id).toBe("card-1");
  });

  test("listPendingTasks filters by feature", async () => {
    const mockLists: TrelloList[] = [
      { id: "list-todo", name: "To Do", closed: false, idBoard: "board-123" },
    ];

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
      new Response(JSON.stringify(mockLists), { status: 200 })
    );
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockCards), { status: 200 })
    );

    const tasks = await adapter.listPendingTasks({ feature: "auth" });

    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe("card-1");
  });

  test("listPendingTasks filters by priority", async () => {
    const mockLists: TrelloList[] = [
      { id: "list-todo", name: "To Do", closed: false, idBoard: "board-123" },
    ];

    const mockCards: TrelloCard[] = [
      {
        id: "card-high",
        name: "High Priority",
        desc: "",
        idList: "list-todo",
        idBoard: "board-123",
        url: "",
        labels: [
          { id: "label-1", idBoard: "board-123", name: "high", color: "red" },
        ],
      },
      {
        id: "card-low",
        name: "Low Priority",
        desc: "",
        idList: "list-todo",
        idBoard: "board-123",
        url: "",
        labels: [
          { id: "label-2", idBoard: "board-123", name: "low", color: "yellow" },
        ],
      },
    ];

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockLists), { status: 200 })
    );
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockCards), { status: 200 })
    );

    const tasks = await adapter.listPendingTasks({ priority: "high" });

    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe("card-high");
  });

  test("countPending returns count", async () => {
    const mockLists: TrelloList[] = [
      { id: "list-todo", name: "To Do", closed: false, idBoard: "board-123" },
    ];

    const mockCards: TrelloCard[] = [
      { id: "1", name: "Task 1", desc: "", idList: "list-todo", idBoard: "board-123", url: "", labels: [] },
      { id: "2", name: "Task 2", desc: "", idList: "list-todo", idBoard: "board-123", url: "", labels: [] },
    ];

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockLists), { status: 200 })
    );
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockCards), { status: 200 })
    );

    const count = await adapter.countPending();

    expect(count).toBe(2);
  });

  test("getTask returns task by ID", async () => {
    const mockLists: TrelloList[] = [
      { id: "list-todo", name: "To Do", closed: false, idBoard: "board-123" },
      { id: "list-doing", name: "Doing", closed: false, idBoard: "board-123" },
    ];

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
      name: "Test Task",
      desc: "Description",
      idList: "list-todo",
      idBoard: "board-123",
      url: "https://trello.com/c/card-123",
      labels: [],
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockCard), { status: 200 })
    );

    const task = await adapter.getTask("card-123");

    expect(task).not.toBeNull();
    expect(task?.id).toBe("card-123");
    expect(task?.title).toBe("Test Task");
  });

  test("getTask returns null on error", async () => {
    const mockLists: TrelloList[] = [
      { id: "list-todo", name: "To Do", closed: false, idBoard: "board-123" },
    ];

    // Initialize lists first
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

  test("markInProgress moves card to Doing list", async () => {
    // Reinitialize adapter
    adapter = new TrelloTaskAdapter(config);

    const mockLists: TrelloList[] = [
      { id: "list-todo", name: "To Do", closed: false, idBoard: "board-123" },
      { id: "list-doing", name: "Doing", closed: false, idBoard: "board-123" },
    ];

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockLists), { status: 200 })
    );
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );
    await adapter.listPendingTasks(); // Initialize lists

    const updatedCard: TrelloCard = {
      id: "card-123",
      name: "Task",
      desc: "",
      idList: "list-doing",
      idBoard: "board-123",
      url: "",
      labels: [],
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(updatedCard), { status: 200 })
    );

    const result = await adapter.markInProgress("card-123");

    expect(result.success).toBe(true);
  });

  test("markCompleted moves card to Done list", async () => {
    // Reinitialize adapter
    adapter = new TrelloTaskAdapter(config);

    const mockLists: TrelloList[] = [
      { id: "list-todo", name: "To Do", closed: false, idBoard: "board-123" },
      { id: "list-done", name: "Done", closed: false, idBoard: "board-123" },
    ];

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockLists), { status: 200 })
    );
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );
    await adapter.listPendingTasks();

    const updatedCard: TrelloCard = {
      id: "card-123",
      name: "Task",
      desc: "",
      idList: "list-done",
      idBoard: "board-123",
      url: "",
      labels: [],
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(updatedCard), { status: 200 })
    );

    const result = await adapter.markCompleted("card-123");

    expect(result.success).toBe(true);
  });

  test("markFailed moves card to Failed list and adds comment", async () => {
    const mockLists: TrelloList[] = [
      { id: "list-todo", name: "To Do", closed: false, idBoard: "board-123" },
      { id: "list-failed", name: "Failed", closed: false, idBoard: "board-123" },
    ];

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockLists), { status: 200 })
    );
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );
    await adapter.listPendingTasks();

    const updatedCard: TrelloCard = {
      id: "card-123",
      name: "Task",
      desc: "",
      idList: "list-failed",
      idBoard: "board-123",
      url: "",
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

  test("resetToPending moves card to To Do list", async () => {
    const mockLists: TrelloList[] = [
      { id: "list-todo", name: "To Do", closed: false, idBoard: "board-123" },
      { id: "list-done", name: "Done", closed: false, idBoard: "board-123" },
    ];

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockLists), { status: 200 })
    );
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );
    await adapter.listPendingTasks();

    const updatedCard: TrelloCard = {
      id: "card-123",
      name: "Task",
      desc: "",
      idList: "list-todo",
      idBoard: "board-123",
      url: "",
      labels: [],
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(updatedCard), { status: 200 })
    );

    const result = await adapter.resetToPending("card-123");

    expect(result.success).toBe(true);
  });

  test("ping returns ok when API accessible", async () => {
    const mockLists: TrelloList[] = [
      { id: "list-1", name: "List", closed: false, idBoard: "board-123" },
    ];

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockLists), { status: 200 })
    );

    const result = await adapter.ping();

    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("ping handles errors", async () => {
    // Reinitialize adapter to clear previous state
    adapter = new TrelloTaskAdapter(config);

    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await adapter.ping();

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Network error");
  });

  test("adaptCard maps priority labels", async () => {
    // Reinitialize adapter
    adapter = new TrelloTaskAdapter(config);

    const mockLists: TrelloList[] = [
      { id: "list-todo", name: "To Do", closed: false, idBoard: "board-123" },
    ];

    // Initialize lists
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockLists), { status: 200 })
    );
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );
    await adapter.listPendingTasks();

    const highCard: TrelloCard = {
      id: "card-high",
      name: "High Priority Task",
      desc: "",
      idList: "list-todo",
      idBoard: "board-123",
      url: "",
      labels: [
        { id: "label-1", idBoard: "board-123", name: "high", color: "red" },
      ],
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(highCard), { status: 200 })
    );

    const task = await adapter.getTask("card-high");

    expect(task?.priority).toBe("high");
  });

  test("adaptCard extracts feature from feat: label", async () => {
    // Reinitialize adapter
    adapter = new TrelloTaskAdapter(config);

    const mockLists: TrelloList[] = [
      { id: "list-todo", name: "To Do", closed: false, idBoard: "board-123" },
    ];

    // Initialize lists
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockLists), { status: 200 })
    );
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );
    await adapter.listPendingTasks();

    const card: TrelloCard = {
      id: "card-1",
      name: "Auth Task",
      desc: "",
      idList: "list-todo",
      idBoard: "board-123",
      url: "",
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

  test("getSubTasks returns empty array", async () => {
    const result = await adapter.getSubTasks("card-123");

    expect(result).toEqual([]);
  });

  test("getDependencies returns empty array", async () => {
    const result = await adapter.getDependencies("card-123");

    expect(result).toEqual([]);
  });

  test("getDependents returns empty array", async () => {
    const result = await adapter.getDependents("card-123");

    expect(result).toEqual([]);
  });

  test("areDependenciesMet returns true", async () => {
    const result = await adapter.areDependenciesMet("card-123");

    expect(result).toBe(true);
  });
});
