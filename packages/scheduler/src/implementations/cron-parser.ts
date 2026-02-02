import { CronParser, CronExpression } from '../interfaces/index.js';

export class SimpleCronParser implements CronParser {
  parse(expression: string): CronExpression {
    if (!expression || !expression.trim()) {
      throw new Error('Invalid cron: empty expression');
    }

    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new Error(`Invalid cron: expected 5 parts, got ${parts.length}`);
    }
    
    return {
      minute: parts[0],
      hour: parts[1],
      dayOfMonth: parts[2],
      month: parts[3],
      dayOfWeek: parts[4]
    };
  }

  isValid(expression: string): boolean {
    try {
      this.parse(expression);
      return true;
    } catch {
      return false;
    }
  }
}
