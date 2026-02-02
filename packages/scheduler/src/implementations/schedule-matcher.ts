import { ScheduleMatcher, Schedule, CronParser, TimeSource } from '../interfaces/index.js';

export class SimpleScheduleMatcher implements ScheduleMatcher {
  constructor(
    private cronParser: CronParser,
    private timeSource: TimeSource = { now: () => Date.now() }
  ) {}

  matches(schedule: Schedule, timestamp: number): boolean {
    if (schedule.startTime && timestamp < schedule.startTime) return false;
    if (schedule.endTime && timestamp > schedule.endTime) return false;
    if (!schedule.cron) return true;

    const cron = this.cronParser.parse(schedule.cron);
    const date = this.getComponents(timestamp, schedule.timezone);

    return (
      this.checkMatch(cron.minute, date.minute) &&
      this.checkMatch(cron.hour, date.hour) &&
      this.checkMatch(cron.dayOfMonth, date.day) &&
      this.checkMatch(cron.month, date.month) &&
      this.checkMatch(cron.dayOfWeek, date.dayOfWeek)
    );
  }

  getNextExecution(schedule: Schedule, afterTimestamp: number): number | null {
    if (!schedule.cron) return null;

    // Safety limit: 1 year (approx)
    const MAX_ITERATIONS = 60 * 24 * 366; 
    let current = afterTimestamp + 60000;
    // Align to minute start
    current = Math.floor(current / 60000) * 60000;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      if (this.matches(schedule, current)) {
        return current;
      }
      current += 60000;
    }
    
    return null;
  }

  private getComponents(timestamp: number, timezone?: string): { minute: number, hour: number, day: number, month: number, dayOfWeek: number } {
    if (!timezone || timezone === 'UTC') {
      const d = new Date(timestamp);
      return {
        minute: d.getUTCMinutes(),
        hour: d.getUTCHours(),
        day: d.getUTCDate(),
        month: d.getUTCMonth() + 1, // 1-12
        dayOfWeek: d.getUTCDay()
      };
    }

    const d = new Date(timestamp);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short'
    }).formatToParts(d);

    const getPart = (type: string) => {
      const p = parts.find(p => p.type === type);
      return p ? parseInt(p.value, 10) : 0;
    };

    const weekdayPart = parts.find(p => p.type === 'weekday')?.value;
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayOfWeek = weekdays.indexOf(weekdayPart || '');

    return {
        minute: getPart('minute'),
        hour: getPart('hour') === 24 ? 0 : getPart('hour'),
        day: getPart('day'),
        month: getPart('month'),
        dayOfWeek: dayOfWeek === -1 ? 0 : dayOfWeek
    };
  }

  private checkMatch(pattern: string, value: number): boolean {
    if (pattern === '*') return true;
    
    if (pattern.startsWith('*/')) {
        const step = parseInt(pattern.substring(2), 10);
        return value % step === 0;
    }

    if (pattern.includes('-')) {
        const [start, end] = pattern.split('-').map(Number);
        return value >= start && value <= end;
    }

    if (pattern.includes(',')) {
        const parts = pattern.split(',').map(Number);
        return parts.includes(value);
    }

    return parseInt(pattern, 10) === value;
  }
}
