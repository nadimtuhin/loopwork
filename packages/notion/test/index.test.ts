import { expect, test, describe, mock, beforeEach } from "bun:test";
import { NotionClient } from "../src/client";
import { NotionTaskAdapter } from "../src/adapter";
import { withNotionBackend } from "../src/plugin";

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
