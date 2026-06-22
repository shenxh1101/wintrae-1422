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
  private substitutionPreviews: Map<string, SubstitutionPreview> = new Map();

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

  private generatePreviewId(): string {
    return 'prev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
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

    const previewId = this.generatePreviewId();
    const validationErrors: string[] = [];

    const week = plan.weeks.find((w) => w.weekNumber === weekNumber);
    if (!week) {
      validationErrors.push('第' + weekNumber + '周不存在');
    }

    let targetDay: { exercises: { exerciseId: string }[]; label: string } | undefined;
    if (week) {
      const d = week.days.find((x) => x.dayOfWeek === dayOfWeek);
      if (!d) {
        validationErrors.push('第' + weekNumber + '周第' + dayOfWeek + '天不存在');
      } else if (d.isRestDay) {
        validationErrors.push('第' + weekNumber + '周第' + dayOfWeek + '天是休息日，不包含任何动作');
      } else {
        targetDay = d;
      }
    }

    if (targetDay) {
      const hasExercise = targetDay.exercises.some((s) => s.exerciseId === targetExerciseId);
      if (!hasExercise) {
        validationErrors.push('动作' + targetExerciseId + '不在第' + weekNumber + '周第' + dayOfWeek + '天的计划中');
      }
    }

    const targetEx = this.library.findById(targetExerciseId);
    const replacementEx = this.library.findById(replacementId);

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
    for (const w of plan.weeks) {
      if (w.weekNumber < weekNumber) continue;
      const d = w.days.find((x) => x.dayOfWeek === dayOfWeek);
      if (d && !d.isRestDay) {
        const affectedIndices: number[] = [];
        d.exercises.forEach((s, idx) => {
          if (s.exerciseId === targetExerciseId) {
            affectedIndices.push(idx + 1);
          }
        });
        if (affectedIndices.length > 0) {
          impact.push({
            weekNumber: w.weekNumber,
            dayOfWeek,
            dayLabel: d.label,
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

    const preview: SubstitutionPreview = {
      previewId,
      targetExerciseId,
      targetExerciseName: targetEx ? targetEx.name : targetExerciseId,
      replacementExerciseId: replacementId,
      replacementExerciseName: replacementEx ? replacementEx.name : replacementId,
      planId,
      weekNumber,
      dayOfWeek,
      isValid: validationErrors.length === 0,
      validationErrors,
      impact,
      risks,
      benefits,
      reason,
    };

    this.substitutionPreviews.set(previewId, preview);
    return preview;
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

    const week = plan.weeks.find((w) => w.weekNumber === weekNumber);
    if (!week) return [];
    const day = week.days.find((d) => d.dayOfWeek === dayOfWeek);
    if (!day || day.isRestDay) return [];
    if (!day.exercises.some((s) => s.exerciseId === targetExerciseId)) return [];

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
    const stored = this.substitutionPreviews.get(preview.previewId);
    if (!stored) {
      throw new SubstitutionError(
        preview.targetExerciseId,
        '预览凭证无效或已过期，请重新获取替换候选列表',
      );
    }

    if (stored.targetExerciseId !== preview.targetExerciseId ||
        stored.replacementExerciseId !== preview.replacementExerciseId ||
        stored.planId !== preview.planId ||
        stored.weekNumber !== preview.weekNumber ||
        stored.dayOfWeek !== preview.dayOfWeek) {
      throw new SubstitutionError(
        preview.targetExerciseId,
        '预览内容与凭证不匹配，请重新获取替换候选列表',
      );
    }

    if (!stored.isValid) {
      throw new SubstitutionError(
        stored.targetExerciseId,
        '替换未通过校验：' + stored.validationErrors.join('；'),
      );
    }

    const plan = this.plans.get(stored.planId);
    if (!plan) {
      throw new SubstitutionError(stored.targetExerciseId, '对应的训练计划不存在');
    }

    const week = plan.weeks.find((w) => w.weekNumber === stored.weekNumber);
    if (!week) {
      throw new SubstitutionError(stored.targetExerciseId, '第' + stored.weekNumber + '周不存在');
    }
    const day = week.days.find((d) => d.dayOfWeek === stored.dayOfWeek);
    if (!day) {
      throw new SubstitutionError(stored.targetExerciseId, '第' + stored.weekNumber + '周第' + stored.dayOfWeek + '天不存在');
    }
    if (day.isRestDay) {
      throw new SubstitutionError(stored.targetExerciseId, '指定训练日是休息日，无法执行替换');
    }
    if (!day.exercises.some((s) => s.exerciseId === stored.targetExerciseId)) {
      throw new SubstitutionError(
        stored.targetExerciseId,
        '动作 ' + stored.targetExerciseId + ' 不在第' + stored.weekNumber + '周第' + stored.dayOfWeek + '天，可能已被替换',
      );
    }

    this.substitutionPreviews.delete(stored.previewId);

    return this.substituteExercise(
      stored.planId,
      stored.weekNumber,
      stored.dayOfWeek,
      stored.targetExerciseId,
      stored.replacementExerciseId,
    );
  }

  substituteExercise(
    planId: string,
    weekNumber: number,
    dayOfWeek: number,
    targetExerciseId: string,
    replacementId: string,
  ): SubstitutionResult {
    const plan = this.getPlan(planId);

    const week = plan.weeks.find((w) => w.weekNumber === weekNumber);
    if (!week) {
      throw new SubstitutionError(targetExerciseId, '第' + weekNumber + '周不存在');
    }
    const day = week.days.find((d) => d.dayOfWeek === dayOfWeek);
    if (!day) {
      throw new SubstitutionError(targetExerciseId, '第' + weekNumber + '周第' + dayOfWeek + '天不存在');
    }
    if (day.isRestDay || !day.exercises.some((s) => s.exerciseId === targetExerciseId)) {
      throw new SubstitutionError(
        targetExerciseId,
        '动作 ' + targetExerciseId + ' 不在指定训练日中，无法替换',
      );
    }

    const preview = this.previewSubstitution(planId, weekNumber, dayOfWeek, targetExerciseId, replacementId);
    if (!preview.isValid) {
      throw new SubstitutionError(targetExerciseId, preview.validationErrors.join('；'));
    }

    const targetEx = this.library.findById(targetExerciseId);
    const replacementEx = this.library.findById(replacementId);

    this.library.substitute(
      plan.weeks.flatMap((w) => w.days).flatMap((d) => d.exercises).map((s) => ({ exerciseId: s.exerciseId })),
      targetExerciseId,
      replacementId,
    );

    const impact: SubstitutionImpact[] = [];
    let actuallyChanged = false;

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
                actuallyChanged = true;
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

    if (!actuallyChanged) {
      throw new SubstitutionError(
        targetExerciseId,
        '替换执行后计划未发生任何变化，请确认动作和训练日是否正确',
      );
    }

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
          complianceNotes: ['无疲劳反馈，未进行调整，计划仍遵循原始器械和身体限制'],
        },
      };
    }

    const result = adjustPlan(plan, feedback, this.library);

    const avoidedIds = new Set<string>();
    if (plan.configSnapshot?.limitations) {
      for (const lim of plan.configSnapshot.limitations) {
        for (const moveId of lim.movementsToAvoid) {
          avoidedIds.add(moveId);
        }
      }
    }

    const complianceNotes: string[] = [];
    if (avoidedIds.size > 0) {
      const targetWeek = result.adjustedPlan.weeks.find(
        (w) => w.weekNumber === weekNumber + 1,
      );
      const conflictingInWeek = new Set<string>();
      if (targetWeek) {
        for (const d of targetWeek.days) {
          for (const s of d.exercises) {
            if (avoidedIds.has(s.exerciseId)) conflictingInWeek.add(s.exerciseId);
          }
        }
      }
      if (conflictingInWeek.size > 0) {
        complianceNotes.push('注意：下周计划仍包含 ' + conflictingInWeek.size + ' 个与身体限制相关的动作，建议手动检查或替换');
      } else {
        complianceNotes.push('已确认：下周计划不包含原始身体限制中的受限动作');
      }

      const weightActions = result.adjustment.adjustments.filter((a) => a.type === 'modify_weight');
      const addingWeight = weightActions.some((a) => (a.newValue ?? 0) > 0);
      if (addingWeight) {
        complianceNotes.push('已遵守：加量操作已跳过与原始身体限制冲突的动作');
      }
    } else {
      complianceNotes.push('未设定身体限制，本次调整无需额外规避');
    }

    if (plan.configSnapshot?.equipment && plan.configSnapshot.equipment.length > 0) {
      complianceNotes.push('本次调整保持原有器械条件：' + plan.configSnapshot.equipment.filter((e) => e !== 'none').join('、') || '仅徒手');
    }

    this.saveVersion(planId, '根据疲劳反馈调整计划', 'adjust');
    this.plans.set(planId, result.adjustedPlan);
    return {
      adjustedPlan: result.adjustedPlan,
      adjustment: {
        ...result.adjustment,
        complianceNotes,
      },
    };
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

      const importedVersions = (data.versions ?? []).map((v) => ({
        ...v,
        plan: { ...v.plan, id: newPlanId },
        reason: '[导入] ' + v.reason,
        actionType: v.actionType ?? ('import' as const),
      }));
      this.versions.set(newPlanId, importedVersions);
      const importedMaxVer = importedVersions.length > 0
        ? Math.max(...importedVersions.map((v) => v.version))
        : 0;
      this.currentVersion.set(newPlanId, importedMaxVer);

      this.saveVersion(newPlanId, '导入计划（保留副本，原计划ID: ' + importedPlanId + '）', 'import');

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
        version: v.version + existingMaxVer + 1,
        reason: '[导入] ' + v.reason,
        actionType: v.actionType ?? ('import' as const),
      }));

      const mergedVersions = [...existingVersions, ...importedVersions];
      this.versions.set(importedPlanId, mergedVersions);

      const mergedMaxVer = mergedVersions.length > 0
        ? Math.max(...mergedVersions.map((v) => v.version))
        : 0;
      this.currentVersion.set(importedPlanId, mergedMaxVer);

      this.plans.set(importedPlanId, data.plan);
      this.saveVersion(importedPlanId, '合并导入计划数据（合并' + importedVersions.length + '条历史版本）', 'import');

      for (const record of data.records) {
        try {
          this.store.recordCompletion(record);
        } catch (_) {
          // ignore duplicates
        }
      }
      for (const feedback of data.feedbacks) {
        try {
          this.store.submitFatigueFeedback(feedback);
        } catch (_) {
          // ignore duplicates
        }
      }

      return data.plan;
    }

    // overwrite (default) or not existing
    const oldVersions = existingPlan ? (this.versions.get(importedPlanId) ?? []) : [];
    this.plans.set(importedPlanId, data.plan);

    const importedVersions = (data.versions ?? []).map((v) => ({
      ...v,
      reason: existingPlan ? '[导入覆盖] ' + v.reason : v.reason,
      actionType: v.actionType ?? ('import' as const),
    }));
    this.versions.set(importedPlanId, importedVersions);

    const maxVersion = importedVersions.length > 0
      ? Math.max(...importedVersions.map((v) => v.version))
      : 0;
    this.currentVersion.set(importedPlanId, maxVersion);

    this.saveVersion(
      importedPlanId,
      existingPlan
        ? '覆盖导入计划（原计划含' + oldVersions.length + '个本地版本已替换）'
        : '导入计划',
      'import',
    );

    for (const record of data.records) {
      try {
        this.store.recordCompletion(record);
      } catch (_) {
        // ignore duplicates
      }
    }
    for (const feedback of data.feedbacks) {
      try {
        this.store.submitFatigueFeedback(feedback);
      } catch (_) {
        // ignore duplicates
      }
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
