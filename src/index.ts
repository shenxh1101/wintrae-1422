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
  SubstitutionCandidate,
  PlanVersionSnapshot,
  ExportedData,
  ImportOptions,
  ImportConflictStrategy,
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

  regeneratePlan(originalConfig: UserConfig, overrides: Partial<UserConfig>, totalWeeks?: number): PlanGenerationResult {
    const mergedConfig: UserConfig = {
      userId: overrides.userId ?? originalConfig.userId,
      goal: overrides.goal ?? originalConfig.goal,
      availableDaysPerWeek: overrides.availableDaysPerWeek ?? originalConfig.availableDaysPerWeek,
      equipment: overrides.equipment ?? originalConfig.equipment,
      limitations: overrides.limitations ?? originalConfig.limitations,
      preferredExerciseIds: overrides.preferredExerciseIds ?? originalConfig.preferredExerciseIds,
      difficulty: overrides.difficulty ?? originalConfig.difficulty,
      sessionDurationMinutes: overrides.sessionDurationMinutes ?? originalConfig.sessionDurationMinutes,
      unitSystem: overrides.unitSystem ?? originalConfig.unitSystem,
      bodyweight: overrides.bodyweight ?? originalConfig.bodyweight,
      maxWeights: overrides.maxWeights ?? originalConfig.maxWeights,
    };
    return this.generatePlanWithDiagnostics(mergedConfig, totalWeeks);
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
    for (const week of plan.weeks) {
      if (week.weekNumber < weekNumber) continue;
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
            weekNumber: week.weekNumber,
            dayOfWeek,
            dayLabel: day.label,
            setIndices: affectedIndices,
          });
        }
      }
    }

    const risks: string[] = [];
    const benefits: string[] = [];
    let reason = '';

    if (targetEx && replacementEx) {
      const targetMg = new Set(targetEx.muscleGroups);
      const repMg = new Set(replacementEx.muscleGroups);
      const overlap = [...targetMg].filter((m) => repMg.has(m));

      if (overlap.length > 0) {
        reason = '共享肌群：' + overlap.join('、');
      } else {
        reason = '肌群不同，' + replacementEx.name + '锻炼' + [...repMg].join('、');
      }

      if (targetEx.difficulty !== replacementEx.difficulty) {
        if (['intermediate', 'advanced'].includes(replacementEx.difficulty) &&
            targetEx.difficulty === 'beginner') {
          risks.push('替换动作难度高于原动作，可能需要适应期');
          reason += '；难度更高';
        } else if (replacementEx.difficulty === 'beginner' &&
                   targetEx.difficulty !== 'beginner') {
          benefits.push('替换动作难度更低，更容易完成');
          reason += '；难度更低';
        }
      }

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
      reason,
    };
  }

  getSubstitutionCandidates(
    planId: string,
    weekNumber: number,
    dayOfWeek: number,
    targetExerciseId: string,
  ): SubstitutionCandidate[] {
    const plan = this.getPlan(planId);
    const config = plan.configSnapshot;
    const targetEx = this.library.findById(targetExerciseId);
    if (!targetEx) return [];

    const avoidedIds = new Set<string>();
    if (config.limitations) {
      for (const lim of config.limitations) {
        for (const moveId of lim.movementsToAvoid) {
          avoidedIds.add(moveId);
        }
      }
    }

    const replacements = this.library.getReplacements(targetExerciseId);
    const candidates: SubstitutionCandidate[] = [];

    for (const rep of replacements) {
      const preview = this.previewSubstitution(planId, weekNumber, dayOfWeek, targetExerciseId, rep.id);
      candidates.push({ exercise: rep, preview });
    }

    return candidates;
  }

  confirmSubstitution(preview: SubstitutionPreview): SubstitutionResult {
    if (!preview.isValid) {
      throw new SubstitutionError(
        preview.targetExerciseId,
        '替换未通过校验：' + preview.validationErrors.join('；'),
      );
    }

    const planId = this.findPlanIdByExercise(preview.targetExerciseId, preview.impact);
    if (!planId) {
      throw new SubstitutionError(preview.targetExerciseId, '找不到对应的训练计划');
    }

    return this.substituteExercise(
      planId,
      preview.impact[0].weekNumber,
      preview.impact[0].dayOfWeek,
      preview.targetExerciseId,
      preview.replacementExerciseId,
    );
  }

  private findPlanIdByExercise(exerciseId: string, impact: SubstitutionImpact[]): string | null {
    for (const [planId, plan] of this.plans) {
      if (impact.length > 0) {
        const week = plan.weeks.find((w) => w.weekNumber === impact[0].weekNumber);
        if (week) {
          const day = week.days.find((d) => d.dayOfWeek === impact[0].dayOfWeek);
          if (day && day.exercises.some((s) => s.exerciseId === exerciseId)) {
            return planId;
          }
        }
      }
    }
    for (const [planId, plan] of this.plans) {
      for (const week of plan.weeks) {
        for (const day of week.days) {
          if (day.exercises.some((s) => s.exerciseId === exerciseId)) {
            return planId;
          }
        }
      }
    }
    return null;
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

    this.saveVersion(planId, '替换动作：' + (targetEx ? targetEx.name : targetExerciseId) + ' -> ' + (replacementEx ? replacementEx.name : replacementId), 'substitute');
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
    this.saveVersion(planId, '根据疲劳反馈调整计划', 'adjust');
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
    this.saveVersion(planId, '切换单位为' + (targetUnit === 'metric' ? '公制' : '英制'), 'unit_convert');
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
    this.saveVersion(planId, '回滚至版本' + version, 'rollback');
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

  importData(data: ExportedData, options?: ImportOptions): TrainingPlan {
    const strategy = options?.strategy ?? 'overwrite';
    const importedPlanId = data.plan.id;
    const existingPlan = this.plans.get(importedPlanId);

    if (existingPlan && strategy === 'keep_both') {
      const newPlanId = importedPlanId + '_imported_' + Date.now();
      const newPlan: TrainingPlan = { ...data.plan, id: newPlanId };
      this.plans.set(newPlanId, newPlan);
      this.versions.set(newPlanId, []);
      this.currentVersion.set(newPlanId, 0);
      this.saveVersion(newPlanId, '导入计划（保留副本）', 'import');
      for (const record of data.records) {
        this.store.recordCompletion({ ...record, planId: newPlanId });
      }
      for (const feedback of data.feedbacks) {
        this.store.submitFatigueFeedback({ ...feedback, planId: newPlanId });
      }
      return newPlan;
    }

    if (existingPlan && strategy === 'merge') {
      const existingVersions = this.versions.get(importedPlanId) ?? [];
      const existingMaxVer = existingVersions.length > 0
        ? Math.max(...existingVersions.map((v) => v.version))
        : 0;

      const importedVersions = (data.versions ?? []).map((v) => ({
        ...v,
        version: v.version + existingMaxVer,
        reason: '[导入] ' + v.reason,
        actionType: v.actionType ?? 'import' as const,
      }));

      const mergedVersions = [...existingVersions, ...importedVersions];
      this.versions.set(importedPlanId, mergedVersions);

      const mergedMaxVer = mergedVersions.length > 0
        ? Math.max(...mergedVersions.map((v) => v.version))
        : 0;
      this.currentVersion.set(importedPlanId, mergedMaxVer);

      this.plans.set(importedPlanId, data.plan);
      this.saveVersion(importedPlanId, '合并导入计划数据', 'import');

      for (const record of data.records) {
        this.store.recordCompletion(record);
      }
      for (const feedback of data.feedbacks) {
        this.store.submitFatigueFeedback(feedback);
      }

      return data.plan;
    }

    this.plans.set(importedPlanId, data.plan);
    this.versions.set(importedPlanId, (data.versions ?? []).map((v) => ({
      ...v,
      actionType: v.actionType ?? 'import' as const,
    })));

    const importedVersions = data.versions ?? [];
    const maxVersion = importedVersions.length > 0
      ? Math.max(...importedVersions.map((v) => v.version))
      : 0;
    this.currentVersion.set(importedPlanId, maxVersion);

    for (const record of data.records) {
      this.store.recordCompletion(record);
    }
    for (const feedback of data.feedbacks) {
      this.store.submitFatigueFeedback(feedback);
    }

    return data.plan;
  }

  private saveVersion(planId: string, reason: string, actionType: PlanVersionSnapshot['actionType'] = 'adjust'): void {
    const plan = this.plans.get(planId);
    if (!plan) return;

    const ver = (this.currentVersion.get(planId) ?? 0) + 1;
    this.currentVersion.set(planId, ver);

    const versionList = this.versions.get(planId) ?? [];
    versionList.push({
      version: ver,
      timestamp: new Date().toISOString(),
      reason,
      actionType,
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
