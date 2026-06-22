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
  EquipmentCategory,
  PlanGenerationResult,
  SubstitutionResult,
  SubstitutionImpact,
  SubstitutionPreview,
  PlanVersionSnapshot,
  ExportedData,
  BodyLimitation,
} from './types';

import { ExerciseLibrary } from './exercise';
import { generatePlan, generatePlanWithDiagnostics } from './plan';
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
  private versions: Map<string, PlanVersionSnapshot[]> = new Map();
  private currentVersion: Map<string, number> = new Map();

  constructor() {
    this.library = new ExerciseLibrary();
    this.store = new RecordStore();
  }

  generatePlan(config: UserConfig, totalWeeks?: number): TrainingPlan {
    const result = this.generatePlanWithDiagnostics(config, totalWeeks);
    if (!result.plan) {
      throw new NoAvailableEquipmentError();
    }
    return result.plan;
  }

  generatePlanWithDiagnostics(config: UserConfig, totalWeeks?: number): PlanGenerationResult {
    const result = generatePlanWithDiagnostics(config, this.library, totalWeeks);
    if (result.plan) {
      this.plans.set(result.plan.id, result.plan);
      this.currentVersion.set(result.plan.id, 0);
      this.versions.set(result.plan.id, []);
    }
    return result;
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

  getExerciseReplacements(exerciseId: string, availableEquipment?: EquipmentCategory[]): Exercise[] {
    return this.library.getReplacements(exerciseId, availableEquipment);
  }

  previewSubstitution(
    planId: string,
    weekNumber: number,
    dayOfWeek: number,
    targetExerciseId: string,
    replacementId: string,
  ): SubstitutionPreview {
    const plan = this.getPlan(planId);
    const config = plan.configSnapshot;

    const targetEx = this.library.findById(targetExerciseId);
    const replacementEx = this.library.findById(replacementId);

    const validationErrors: string[] = [];

    if (!targetEx) {
      validationErrors.push('原动作不存在：' + targetExerciseId);
    }
    if (!replacementEx) {
      validationErrors.push('替换动作不存在：' + replacementId);
    }

    if (replacementEx && config.equipment && config.equipment.length > 0) {
      const hasEquipment = replacementEx.equipment.some(
        (eq) => eq === 'none' || config.equipment.includes(eq),
      );
      if (!hasEquipment) {
        validationErrors.push(
          '替换动作 ' + replacementEx.name + ' 需要器械 ' +
          replacementEx.equipment.join('、') + '，当前器械条件不满足',
        );
      }
    }

    if (replacementEx && config.limitations && config.limitations.length > 0) {
      const avoidedIds = new Set<string>();
      for (const lim of config.limitations) {
        for (const moveId of lim.movementsToAvoid) {
          avoidedIds.add(moveId);
        }
      }
      if (avoidedIds.has(replacementId)) {
        validationErrors.push(
          '替换动作 ' + replacementEx.name + ' 在身体限制范围内，不建议使用',
        );
      }
    }

    const impact: SubstitutionImpact[] = [];
    const week = plan.weeks.find((w) => w.weekNumber === weekNumber);
    if (week) {
      const day = week.days.find((d) => d.dayOfWeek === dayOfWeek);
      if (day) {
        const affectedIndices: number[] = [];
        day.exercises.forEach((s, idx) => {
          if (s.exerciseId === targetExerciseId) {
            affectedIndices.push(idx + 1);
          }
        });
        if (affectedIndices.length > 0) {
          impact.push({
            weekNumber,
            dayOfWeek,
            dayLabel: day.label,
            setIndices: affectedIndices,
          });
        }
      }
    }

    const risks: string[] = [];
    const benefits: string[] = [];

    if (targetEx && replacementEx) {
      if (targetEx.difficulty !== replacementEx.difficulty) {
        if (['intermediate', 'advanced'].includes(replacementEx.difficulty) &&
            targetEx.difficulty === 'beginner') {
          risks.push('替换动作难度高于原动作，可能需要适应期');
        } else if (replacementEx.difficulty === 'beginner' &&
                   targetEx.difficulty !== 'beginner') {
          benefits.push('替换动作难度更低，更容易完成');
        }
      }

      const targetMg = new Set(targetEx.muscleGroups);
      const repMg = new Set(replacementEx.muscleGroups);
      const missingMg = [...targetMg].filter((m) => !repMg.has(m));
      if (missingMg.length > 0) {
        risks.push('替换动作不覆盖原动作的以下肌群：' + missingMg.join('、'));
      }

      const newMg = [...repMg].filter((m) => !targetMg.has(m));
      if (newMg.length > 0) {
        benefits.push('替换动作额外锻炼以下肌群：' + newMg.join('、'));
      }
    }

    return {
      targetExerciseId,
      targetExerciseName: targetEx ? targetEx.name : targetExerciseId,
      replacementExerciseId: replacementId,
      replacementExerciseName: replacementEx ? replacementEx.name : replacementId,
      isValid: validationErrors.length === 0,
      validationErrors,
      impact,
      risks,
      benefits,
    };
  }

  substituteExercise(
    planId: string,
    weekNumber: number,
    dayOfWeek: number,
    targetExerciseId: string,
    replacementId: string,
  ): SubstitutionResult {
    const preview = this.previewSubstitution(planId, weekNumber, dayOfWeek, targetExerciseId, replacementId);
    if (!preview.isValid) {
      throw new SubstitutionError(targetExerciseId, preview.validationErrors.join('；'));
    }

    const plan = this.getPlan(planId);

    const targetEx = this.library.findById(targetExerciseId);
    const replacementEx = this.library.findById(replacementId);

    this.library.substitute(
      plan.weeks.flatMap((w) => w.days).flatMap((d) => d.exercises).map((s) => ({ exerciseId: s.exerciseId })),
      targetExerciseId,
      replacementId,
    );

    const impact: SubstitutionImpact[] = [];

    const updatedPlan = {
      ...plan,
      weeks: plan.weeks.map((w) => {
        if (w.weekNumber !== weekNumber) return w;
        return {
          ...w,
          days: w.days.map((d) => {
            if (d.dayOfWeek !== dayOfWeek) return d;
            const affectedIndices: number[] = [];
            const updatedExercises = d.exercises.map((s, idx) => {
              if (s.exerciseId === targetExerciseId) {
                affectedIndices.push(idx + 1);
                return { ...s, exerciseId: replacementId };
              }
              return s;
            });

            if (affectedIndices.length > 0) {
              impact.push({
                weekNumber,
                dayOfWeek,
                dayLabel: d.label,
                setIndices: affectedIndices,
              });
            }

            return { ...d, exercises: updatedExercises };
          }),
        };
      }),
      updatedAt: new Date().toISOString(),
    };

    this.saveVersion(planId, '替换动作：' + (targetEx ? targetEx.name : targetExerciseId) + ' -> ' + (replacementEx ? replacementEx.name : replacementId));
    this.plans.set(planId, updatedPlan);

    const availableReplacements = this.library.getReplacements(targetExerciseId);

    return {
      plan: updatedPlan,
      replaced: {
        targetExerciseId,
        targetExerciseName: targetEx ? targetEx.name : targetExerciseId,
        replacementExerciseId: replacementId,
        replacementExerciseName: replacementEx ? replacementEx.name : replacementId,
      },
      impact,
      availableReplacements,
    };
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
    this.saveVersion(planId, '根据疲劳反馈调整计划');
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
    this.saveVersion(planId, '切换单位为' + (targetUnit === 'metric' ? '公制' : '英制'));
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

  getPlanVersions(planId: string): PlanVersionSnapshot[] {
    return this.versions.get(planId) ?? [];
  }

  getCurrentVersion(planId: string): number {
    return this.currentVersion.get(planId) ?? 0;
  }

  rollbackToVersion(planId: string, version: number): TrainingPlan {
    const versionList = this.versions.get(planId);
    if (!versionList) throw new PlanNotFoundError(planId);

    const snapshot = versionList.find((v) => v.version === version);
    if (!snapshot) {
      throw new FitnessSDKError('VERSION_NOT_FOUND', 'Version ' + version + ' not found for plan ' + planId);
    }

    this.plans.set(planId, { ...snapshot.plan });
    this.saveVersion(planId, '回滚至版本' + version);
    return this.getPlan(planId);
  }

  exportData(planId: string): ExportedData {
    const plan = this.getPlan(planId);
    const records = this.store.getRecordsByPlan(planId);
    const feedbacks = this.store.getFeedbacksByPlan(planId);
    const versions = this.versions.get(planId) ?? [];

    return {
      plan,
      records,
      feedbacks,
      versions,
      exportedAt: new Date().toISOString(),
      sdkVersion: '1.0.0',
    };
  }

  importData(data: ExportedData): void {
    this.plans.set(data.plan.id, data.plan);
    this.versions.set(data.plan.id, data.versions ?? []);

    const importedVersions = data.versions ?? [];
    const maxVersion = importedVersions.length > 0
      ? Math.max(...importedVersions.map((v) => v.version))
      : 0;
    this.currentVersion.set(data.plan.id, maxVersion);

    for (const record of data.records) {
      this.store.recordCompletion(record);
    }

    for (const feedback of data.feedbacks) {
      this.store.submitFatigueFeedback(feedback);
    }
  }

  private saveVersion(planId: string, reason: string): void {
    const plan = this.plans.get(planId);
    if (!plan) return;

    const ver = (this.currentVersion.get(planId) ?? 0) + 1;
    this.currentVersion.set(planId, ver);

    const versionList = this.versions.get(planId) ?? [];
    versionList.push({
      version: ver,
      timestamp: new Date().toISOString(),
      reason,
      plan: JSON.parse(JSON.stringify(plan)),
    });
    this.versions.set(planId, versionList);
  }
}

export * from './types';

export {
  FitnessSDKError,
  InvalidConfigError,
  ExerciseNotFoundError,
  PlanNotFoundError,
  SubstitutionError,
  DuplicateExerciseError,
  InvalidFeedbackError,
  NoAvailableEquipmentError,
  InsufficientDaysError,
};

export { ExerciseLibrary } from './exercise';
export { RecordStore } from './record';
