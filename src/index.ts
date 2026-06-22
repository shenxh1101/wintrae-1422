import {
  UserConfig,
  TrainingPlan,
  TrainingRecord,
  FatigueFeedback,
  PlanProgress,
  WeeklyReport,
  PlanAdjustment,
  Exercise,
  ExerciseFilter,
  WarmupSuggestion,
  TemplateConfig,
  UnitSystem,
  FitnessGoal,
  MuscleGroup,
  DifficultyLevel,
  ExerciseSet,
  WorkoutDay,
} from './types';

import { ExerciseLibrary } from './exercise';
import { generatePlan } from './plan';
import { getDefaultTemplateConfig } from './plan/templates';
import { generateWarmup } from './plan/warmup';
import { computeRestTime } from './plan/progression';
import { adjustPlan } from './adjustment';
import { RecordStore } from './record';
import { calculateProgress, generateWeeklyReport } from './report';
import { convertWeight, convertPlanUnits, formatWeight, getUnitLabel } from './units';

import {
  FitnessSDKError,
  InvalidConfigError,
  ExerciseNotFoundError,
  PlanNotFoundError,
  RecordNotFoundError,
  SubstitutionError,
  DuplicateExerciseError,
  InvalidFeedbackError,
  NoAvailableEquipmentError,
  InsufficientDaysError,
} from './errors';

export class FitnessTrainingSDK {
  private library: ExerciseLibrary;
  private store: RecordStore;
  private plans: Map<string, TrainingPlan> = new Map();

  constructor() {
    this.library = new ExerciseLibrary();
    this.store = new RecordStore();
  }

  generatePlan(config: UserConfig, totalWeeks?: number): TrainingPlan {
    const plan = generatePlan(config, this.library, totalWeeks);
    this.plans.set(plan.id, plan);
    return plan;
  }

  getPlan(planId: string): TrainingPlan {
    const plan = this.plans.get(planId);
    if (!plan) throw new PlanNotFoundError(planId);
    return plan;
  }

  getPlanWithRecords(planId: string): TrainingPlan {
    const plan = this.getPlan(planId);
    return this.store.applyRecordsToPlan(plan);
  }

  registerExercise(exercise: Exercise): void {
    this.library.register(exercise);
  }

  registerExercises(exercises: Exercise[]): void {
    this.library.registerMany(exercises);
  }

  queryExercises(filter?: ExerciseFilter): Exercise[] {
    return this.library.query(filter);
  }

  getExercise(id: string): Exercise {
    return this.library.getById(id);
  }

  findExercise(id: string): Exercise | undefined {
    return this.library.findById(id);
  }

  getExerciseReplacements(exerciseId: string): Exercise[] {
    return this.library.getReplacements(exerciseId);
  }

  substituteExercise(
    planId: string,
    weekNumber: number,
    dayOfWeek: number,
    targetExerciseId: string,
    replacementId: string,
  ): TrainingPlan {
    const plan = this.getPlan(planId);

    const exerciseRefs = plan.weeks
      .flatMap((w) => w.days)
      .flatMap((d) => d.exercises)
      .map((s) => ({ exerciseId: s.exerciseId }));
    this.library.substitute(exerciseRefs, targetExerciseId, replacementId);

    const updatedPlan = {
      ...plan,
      weeks: plan.weeks.map((w) => {
        if (w.weekNumber !== weekNumber) return w;
        return {
          ...w,
          days: w.days.map((d) => {
            if (d.dayOfWeek !== dayOfWeek) return d;
            return {
              ...d,
              exercises: d.exercises.map((s) =>
                s.exerciseId === targetExerciseId
                  ? { ...s, exerciseId: replacementId }
                  : s,
              ),
            };
          }),
        };
      }),
      updatedAt: new Date().toISOString(),
    };

    this.plans.set(planId, updatedPlan);
    return updatedPlan;
  }

  getWarmupSuggestions(
    muscleGroups: MuscleGroup[],
    goal: FitnessGoal,
    difficulty: DifficultyLevel,
  ): WarmupSuggestion[] {
    return generateWarmup(muscleGroups, goal, difficulty, this.library);
  }

  getRestTime(goal: FitnessGoal): number {
    return computeRestTime(goal, '');
  }

  getDefaultTemplate(
    goal: FitnessGoal,
    daysPerWeek: number,
    difficulty: DifficultyLevel,
  ): TemplateConfig {
    return getDefaultTemplateConfig(goal, daysPerWeek, difficulty);
  }

  recordTraining(record: TrainingRecord): TrainingRecord {
    return this.store.recordCompletion(record);
  }

  recordTrainingBatch(records: TrainingRecord[]): TrainingRecord[] {
    return this.store.recordCompletions(records);
  }

  submitFatigueFeedback(feedback: FatigueFeedback): FatigueFeedback {
    return this.store.submitFatigueFeedback(feedback);
  }

  adjustPlan(planId: string, weekNumber: number): { adjustedPlan: TrainingPlan; adjustment: PlanAdjustment } {
    const plan = this.getPlan(planId);
    const feedback = this.store.getFeedback(planId, weekNumber);
    if (!feedback) {
      return {
        adjustedPlan: plan,
        adjustment: {
          planId,
          weekNumber: weekNumber + 1,
          adjustments: [],
          reason: '没有疲劳反馈数据，保持原计划',
        },
      };
    }

    const result = adjustPlan(plan, feedback, this.library);
    this.plans.set(planId, result.adjustedPlan);
    return result;
  }

  getProgress(planId: string): PlanProgress {
    const plan = this.getPlanWithRecords(planId);
    return calculateProgress(plan, this.store);
  }

  getWeeklyReport(planId: string, weekNumber: number): WeeklyReport {
    const plan = this.getPlanWithRecords(planId);
    return generateWeeklyReport(plan, weekNumber, this.store, this.library);
  }

  convertPlanUnits(planId: string, targetUnit: UnitSystem): TrainingPlan {
    const plan = this.getPlan(planId);
    const converted = convertPlanUnits(plan, targetUnit);
    this.plans.set(planId, converted);
    return converted;
  }

  convertWeight(value: number, from: UnitSystem, to: UnitSystem): number {
    return convertWeight(value, from, to);
  }

  formatWeight(value: number, unit: UnitSystem): string {
    return formatWeight(value, unit);
  }

  getUnitLabel(unit: UnitSystem): string {
    return getUnitLabel(unit);
  }

  getExerciseCount(): number {
    return this.library.count();
  }

  getCustomExerciseCount(): number {
    return this.library.countCustom();
  }

  removeCustomExercise(id: string): boolean {
    return this.library.removeCustom(id);
  }

  getAllPlans(): TrainingPlan[] {
    return Array.from(this.plans.values());
  }
}

export * from './types';

export {
  FitnessSDKError,
  InvalidConfigError,
  ExerciseNotFoundError,
  PlanNotFoundError,
  RecordNotFoundError,
  SubstitutionError,
  DuplicateExerciseError,
  InvalidFeedbackError,
  NoAvailableEquipmentError,
  InsufficientDaysError,
};

export { ExerciseLibrary } from './exercise';
export { RecordStore } from './record';
