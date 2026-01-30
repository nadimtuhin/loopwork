
export type UserState = 'IDLE' | 'DRAFTING_TASK' | 'CONFIRM_TASK'

export interface TaskDraft {
  title?: string
  description?: string
  priority?: 'high' | 'medium' | 'low'
}

export interface UserSession {
  userId: number
  chatId: number
  state: UserState
  draft?: TaskDraft
  lastActivity: number
}

export class SessionManager {
  private sessions: Map<number, UserSession> = new Map()
  private readonly SESSION_TIMEOUT = 1000 * 60 * 10

  getSession(userId: number, chatId: number): UserSession {
    this.cleanup()
    
    let session = this.sessions.get(userId)
    if (!session) {
      session = {
        userId,
        chatId,
        state: 'IDLE',
        lastActivity: Date.now()
      }
      this.sessions.set(userId, session)
    }
    
    session.lastActivity = Date.now()
    return session
  }

  updateSession(userId: number, updates: Partial<UserSession>) {
    const session = this.sessions.get(userId)
    if (session) {
      Object.assign(session, updates)
      session.lastActivity = Date.now()
    }
  }

  clearSession(userId: number) {
    const session = this.sessions.get(userId)
    if (session) {
      session.state = 'IDLE'
      session.draft = undefined
      session.lastActivity = Date.now()
    }
  }

  private cleanup() {
    const now = Date.now()
    for (const [userId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.SESSION_TIMEOUT) {
        this.sessions.delete(userId)
      }
    }
  }
}
