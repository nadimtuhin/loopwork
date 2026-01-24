import { Client } from "@notionhq/client";

export interface QueryOptions {
  status?: {
    property: string;
    value: string;
  };
  sortByPriority?: {
    property: string;
    direction: "ascending" | "descending";
  };
}

export class NotionClient {
  private notion: Client;
  private databaseId: string;

  constructor(apiKey: string, databaseId: string) {
    this.notion = new Client({ auth: apiKey });
    this.databaseId = databaseId;
  }

  async queryTasks(options: QueryOptions = {}) {
    try {
      const { status, sortByPriority } = options;

      const filter: any = status
        ? {
            property: status.property,
            status: {
              equals: status.value,
            },
          }
        : undefined;

      const sorts: any[] = sortByPriority
        ? [
            {
              property: sortByPriority.property,
              direction: sortByPriority.direction,
            },
          ]
        : [];

      return await this.notion.databases.query({
        database_id: this.databaseId,
        filter,
        sorts,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  async updateTask(pageId: string, properties: any) {
    try {
      return await this.notion.pages.update({
        page_id: pageId,
        properties,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  async getTask(pageId: string) {
    try {
      return await this.notion.pages.retrieve({
        page_id: pageId,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  async addComment(pageId: string, text: string) {
    try {
      return await this.notion.blocks.children.append({
        block_id: pageId,
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: text,
                  },
                },
              ],
            },
          },
        ],
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof Error) {
      throw new Error(`Notion API Error: ${error.message}`);
    }
    throw new Error("An unknown Notion API error occurred");
  }
}
