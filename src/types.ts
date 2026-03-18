export type TaskStatus = 'not-started' | 'finished';
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  date: string; // ISO date string (YYYY-MM-DD)
  timeSpent: number; // in seconds
  order: number;
  isTimerRunning?: boolean;
  lastTimerStart?: number; // timestamp
  isOnHold?: boolean;
  notes?: string;
  subtasks?: { id: string; title: string; completed: boolean }[];
  recurrence?: {
    type: RecurrenceType;
    daysOfWeek?: number[]; // 0-6, where 0 is Sunday
    dayOfMonth?: number;
  };
  isRecurrenceParent?: boolean;
  parentId?: string;
}
