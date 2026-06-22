import {
  TrainingRecord,
  FatigueFeedback,
  FatigueLevel,
  MuscleGroup,
  TrainingPlan,
  WorkoutDay,
  ExerciseSet,
} from '../types';
import { InvalidFeedbackError, PlanNotFoundError } from '../errors';

export class RecordStore {
  private records: Map<string, TrainingRecord> = new Map();
  private feedbacks: Map<string, FatigueFeedback> = new Map();

  recordCompletion(record: TrainingRecord): TrainingRecord {
    const id = record.id || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const stored: TrainingRecord = {
      ...record,
      id,
      completedAt: record.completedAt || new Date().toISOString(),
    };
    this.records.set(stored.id, stored);
    return stored;
  }

  recordCompletions(records: TrainingRecord[]): TrainingRecord[] {
    return records.map((r) => this.recordCompletion(r));
  }

  getRecord(id: string): TrainingRecord | undefined {
    return this.records.get(id);
  }

  getRecordsByPlan(planId: string): TrainingRecord[] {
    return Array.from(this.records.values()).filter((r) => r.planId === planId);
  }

  getRecordsByWeek(planId: string, weekNumber: number): TrainingRecord[] {
    return this.getRecordsByPlan(planId).filter((r) => r.weekNumber === weekNumber);
  }

  getRecordsByDay(planId: string, weekNumber: number, dayOfWeek: number): TrainingRecord[] {
    return this.getRecordsByWeek(planId, weekNumber).filter((r) => r.dayOfWeek === dayOfWeek);
  }

  submitFatigueFeedback(feedback: FatigueFeedback): FatigueFeedback {
    if (!feedback.planId) {
      throw new InvalidFeedbackError('planId is required');
    }
    if (!feedback.overallFatigue || feedback.overallFatigue < 1 || feedback.overallFatigue > 10) {
      throw new InvalidFeedbackError('overallFatigue must be between 1 and 10');
    }
    if (feedback.sleepQuality < 1 || feedback.sleepQuality > 10) {
      throw new InvalidFeedbackError('sleepQuality must be between 1 and 10');
    }
    if (feedback.motivationLevel < 1 || feedback.motivationLevel > 10) {
      throw new InvalidFeedbackError('motivationLevel must be between 1 and 10');
    }

    const key = `${feedback.planId}_w${feedback.weekNumber}`;
    const stored: FatigueFeedback = {
      ...feedback,
      submittedAt: feedback.submittedAt || new Date().toISOString(),
    };
    this.feedbacks.set(key, stored);
    return stored;
  }

  getFeedback(planId: string, weekNumber: number): FatigueFeedback | undefined {
    return this.feedbacks.get(`${planId}_w${weekNumber}`);
  }

  getFeedbacksByPlan(planId: string): FatigueFeedback[] {
    return Array.from(this.feedbacks.values()).filter((f) => f.planId === planId);
  }

  applyRecordsToPlan(plan: TrainingPlan): TrainingPlan {
    const records = this.getRecordsByPlan(plan.id);
    if (records.length === 0) return plan;

    const recordMap = new Map<string, TrainingRecord>();
    for (const r of records) {
      recordMap.set(`${r.weekNumber}_${r.dayOfWeek}_${r.exerciseId}_${r.setIndex}`, r);
    }

    const updatedWeeks = plan.weeks.map((week) => ({
      ...week,
      days: week.days.map((day) => ({
        ...day,
        exercises: day.exercises.map((set) => {
          const key = `${week.weekNumber}_${day.dayOfWeek}_${set.exerciseId}_${set.setIndex}`;
          const record = recordMap.get(key);
          if (record) {
            return {
              ...set,
              actualReps: record.actualReps,
              actualWeight: record.actualWeight,
              completed: true,
            };
          }
          return set;
        }),
      })),
    }));

    return { ...plan, weeks: updatedWeeks, updatedAt: new Date().toISOString() };
  }

  getCompletionRateForWeek(plan: TrainingPlan, weekNumber: number): number {
    const week = plan.weeks.find((w) => w.weekNumber === weekNumber);
    if (!week) return 0;

    let totalSets = 0;
    let completedSets = 0;

    for (const day of week.days) {
      for (const set of day.exercises) {
        totalSets++;
        if (set.completed) completedSets++;
      }
    }

    return totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;
  }
}
