import { TrelloClient } from './client';
import type { TrelloBackendConfig, TrelloCard, TrelloList } from './types';
import type { 
  TaskBackend, 
  Task, 
  FindTaskOptions, 
  UpdateResult, 
  PingResult 
} from 'loopwork/contracts';
import type { Priority, TaskStatus } from 'loopwork/contracts';

export class TrelloTaskAdapter implements TaskBackend {
  readonly name = 'trello';
  private client: TrelloClient;
  private config: TrelloBackendConfig;
  private listIdMap: Map<string, string> = new Map();

  constructor(config: TrelloBackendConfig) {
    this.config = config;
    this.client = new TrelloClient(config.apiKey, config.token, config.boardId);
  }

  private async ensureLists(): Promise<void> {
    if (this.listIdMap.size > 0) return;

    const lists = await this.client.getLists();

    const pendingName = this.config.lists?.pending || 'To Do';
    const inProgressName = this.config.lists?.inProgress || 'Doing';
    const completedName = this.config.lists?.completed || 'Done';
    const failedName = this.config.lists?.failed || 'Failed';
    const quarantinedName = this.config.lists?.quarantined || 'Quarantined';

    this.findAndSetListId(lists, 'pending', pendingName);
    this.findAndSetListId(lists, 'inProgress', inProgressName);
    this.findAndSetListId(lists, 'completed', completedName);
    this.findAndSetListId(lists, 'failed', failedName);
    this.findAndSetListId(lists, 'quarantined', quarantinedName);

    if (!this.listIdMap.has('pending')) {
      const available = lists.map(l => l.name).join(', ');
      throw new Error(`Pending list "${pendingName}" not found on board. Available lists: ${available}`);
    }
  }

  private findAndSetListId(lists: TrelloList[], key: string, name: string) {
    const list = lists.find(l => l.name.toLowerCase() === name.toLowerCase());
    if (list) {
      this.listIdMap.set(key, list.id);
    }
  }

  private getListId(key: string): string {
    const id = this.listIdMap.get(key);
    if (!id) {
      const defaultNames: Record<string, string> = {
        pending: 'To Do',
        inProgress: 'Doing',
        completed: 'Done',
        failed: 'Failed',
        quarantined: 'Quarantined'
      };
      const name = (this.config.lists as any)?.[key] || defaultNames[key];
      throw new Error(`List "${name}" (${key}) not found. Ensure it exists on your board.`);
    }
    return id;
  }

  async findNextTask(options?: FindTaskOptions): Promise<Task | null> {
    const tasks = await this.listPendingTasks(options);
    return tasks[0] || null;
  }

  async getTask(taskId: string): Promise<Task | null> {
    try {
      const card = await this.client.getCard(taskId);
      return await this.adaptCard(card);
    } catch {
      return null;
    }
  }

  async listPendingTasks(options?: FindTaskOptions): Promise<Task[]> {
    await this.ensureLists();
    const pendingListId = this.getListId('pending');
    const failedListId = this.getListId('failed');

    const [pendingCards, failedCards] = await Promise.all([
      this.client.getCardsInList(pendingListId),
      this.client.getCardsInList(failedListId)
    ]);
    
    const allCards = [...pendingCards, ...failedCards].sort((a, b) => (a as any).pos - (b as any).pos);
    
    let tasks = await Promise.all(allCards.map(card => this.adaptCard(card)));

    if (options?.feature) {
      tasks = tasks.filter((t: Task) => t.feature === options.feature);
    }
    if (options?.priority) {
      tasks = tasks.filter((t: Task) => t.priority === options.priority);
    }

    tasks = tasks.filter((t: Task) => {
      if (t.status === 'pending') return true;
      if (t.status === 'failed' && options?.retryCooldown !== undefined) {
        const failedAt = t.timestamps?.failedAt;
        if (!failedAt) return false;
        const elapsed = Date.now() - new Date(failedAt).getTime();
        return elapsed > options.retryCooldown;
      }
      return false;
    });

    return tasks;
  }

  async countPending(options?: FindTaskOptions): Promise<number> {
    const tasks = await this.listPendingTasks(options);
    return tasks.length;
  }

  async markInProgress(taskId: string): Promise<UpdateResult> {
    try {
      await this.ensureLists();
      const listId = this.getListId('inProgress');
      await this.client.moveCard(taskId, listId);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async markCompleted(taskId: string, comment?: string): Promise<UpdateResult> {
    try {
      await this.ensureLists();
      const listId = this.getListId('completed');
      await this.client.moveCard(taskId, listId);
      if (comment) {
        await this.client.addComment(taskId, comment);
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async markFailed(taskId: string, error: string): Promise<UpdateResult> {
    try {
      await this.ensureLists();
      try {
        const listId = this.getListId('failed');
        await this.client.moveCard(taskId, listId);
      } catch {
      }

      await this.client.addComment(taskId, `**Loopwork Failed**\n\n${error}`);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async markQuarantined(taskId: string, reason: string): Promise<UpdateResult> {
    try {
      await this.ensureLists();
      const listId = this.getListId('quarantined');
      await this.client.moveCard(taskId, listId);
      await this.client.addComment(taskId, `**Loopwork Quarantined**\n\n${reason}`);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async resetToPending(taskId: string): Promise<UpdateResult> {
    try {
      await this.ensureLists();
      const listId = this.getListId('pending');
      await this.client.moveCard(taskId, listId);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async ping(): Promise<PingResult> {
    const start = Date.now();
    try {
      await this.client.getLists();
      return { ok: true, latencyMs: Date.now() - start };
    } catch (e: any) {
      return { ok: false, latencyMs: Date.now() - start, error: e.message };
    }
  }

  async getSubTasks(taskId: string): Promise<Task[]> {
    return [];
  }

  async getDependencies(taskId: string): Promise<Task[]> {
    return [];
  }

  async getDependents(taskId: string): Promise<Task[]> {
    return [];
  }

  async areDependenciesMet(taskId: string): Promise<boolean> {
    return true;
  }

  private async adaptCard(card: TrelloCard): Promise<Task> {

    let status: TaskStatus = 'pending';
    if (card.idList === this.listIdMap.get('inProgress')) status = 'in-progress';
    else if (card.idList === this.listIdMap.get('completed')) status = 'completed';
    else if (card.idList === this.listIdMap.get('failed')) status = 'failed';
    else if (card.idList === this.listIdMap.get('quarantined')) status = 'quarantined';

    let priority: Priority = 'medium';
    if (card.labels.some(l => l.name.toLowerCase() === 'high')) priority = 'high';
    else if (card.labels.some(l => l.name.toLowerCase() === 'low')) priority = 'low';

    const featureLabel = card.labels.find(l => l.name.startsWith('feat:'));
    const feature = featureLabel?.name.replace('feat:', '');

    const timestamps: Task['timestamps'] = {
      createdAt: new Date(parseInt(card.id.substring(0, 8), 16) * 1000).toISOString(),
    };

    if (status === 'failed') {
      timestamps.failedAt = card.dateLastActivity;
    } else if (status === 'quarantined') {
      timestamps.quarantinedAt = card.dateLastActivity;
    }

    return {
      id: card.id,
      title: card.name,
      description: card.desc,
      status,
      priority,
      feature,
      metadata: { url: card.url, labels: card.labels.map(l => l.name) },
      timestamps,
    };
  }
}
