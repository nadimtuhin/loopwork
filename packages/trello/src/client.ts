import type { TrelloList, TrelloCard } from './types';

export class TrelloClient {
  private baseUrl = 'https://api.trello.com/1';
  private apiKey: string;
  private token: string;
  private boardId: string;

  constructor(apiKey: string, token: string, boardId: string) {
    this.apiKey = apiKey;
    this.token = token;
    this.boardId = boardId;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: any,
    queryParams: Record<string, string> = {}
  ): Promise<T> {
    const params = new URLSearchParams({
      key: this.apiKey,
      token: this.token,
      ...queryParams,
    });

    const url = `${this.baseUrl}${endpoint}${endpoint.includes('?') ? '&' : '?'}${params.toString()}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Trello API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  async getLists(): Promise<TrelloList[]> {
    return this.request<TrelloList[]>('GET', `/boards/${this.boardId}/lists`);
  }

  async getCardsInList(listId: string): Promise<TrelloCard[]> {
    return this.request<TrelloCard[]>('GET', `/lists/${listId}/cards`);
  }

  async moveCard(cardId: string, listId: string): Promise<TrelloCard> {
    return this.request<TrelloCard>('PUT', `/cards/${cardId}`, { idList: listId });
  }

  async addComment(cardId: string, text: string): Promise<void> {
    await this.request('POST', `/cards/${cardId}/actions/comments`, undefined, { text });
  }

  async getCard(cardId: string): Promise<TrelloCard> {
    return this.request<TrelloCard>('GET', `/cards/${cardId}`);
  }
}
