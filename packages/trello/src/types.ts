export interface TrelloBackendConfig {
  apiKey: string;
  token: string;
  boardId: string;
  lists?: {
    pending?: string;
    inProgress?: string;
    completed?: string;
    failed?: string;
  };
}

export interface TrelloList {
  id: string;
  name: string;
  closed: boolean;
  idBoard: string;
}

export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  idList: string;
  idBoard: string;
  url: string;
  labels: Array<{
    id: string;
    idBoard: string;
    name: string;
    color: string;
  }>;
}
