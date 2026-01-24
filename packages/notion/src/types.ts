export interface NotionBackendConfig {
  apiKey: string;
  databaseId: string;
  properties?: {
    status?: string;
    priority?: string;
    title?: string;
    description?: string;
    feature?: string;
    parentId?: string;
    dependsOn?: string;
  };
  statusValues?: {
    pending?: string;
    inProgress?: string;
    completed?: string;
    failed?: string;
  };
}
