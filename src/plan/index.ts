import {
  UserConfig,
  TrainingPlan,
  TrainingWeek,
  WorkoutDay,
  ExerciseSet,
  FitnessGoal,
  MuscleGroup,
  EquipmentCategory,
  DifficultyLevel,
  BodyLimitation,
  PlanGenerationResult,
  PlanGenerationWarning,
  ExerciseAlternative,
  UnresolvableDay,
  Exercise,
  PlanConfigSnapshot,
  RemediationSuggestion,
} from '../types';
import { ExerciseLibrary } from '../exercise';
import { getTemplate } from './templates';
import { generateWarmup } from './warmup';
import {
  computeSetsForWeek,
  computeRestTime,
  computeEstimatedDuration,
  getProgressionConfig,
} from './progression';
import {
  InvalidConfigError,
  NoAvailableEquipmentError,
  InsufficientDaysError,
} from '../errors';

const MIN_DAYS_BY_GOAL: Record<FitnessGoal, number> = {
  strength: 3,
  muscle_gain: 3,
  fat_loss: 3,
  endurance: 3,
  flexibility: 2,
  general_fitness: 2,
};

const DEFAULT_TOTAL_WEEKS = 8;

function validateConfig(config: UserConfig): void {
  if (!config.userId) {
    throw new InvalidConfigError('userId is required');
  }
  if (!config.goal) {
    throw new InvalidConfigError('goal is required');
  }
  if (!config.availableDaysPerWeek || config.availableDaysPerWeek < 1) {
    throw new InvalidConfigError('availableDaysPerWeek must be at least 1');
  }
  if (config.availableDaysPerWeek > 7) {
    throw new InvalidConfigError('availableDaysPerWeek cannot exceed 7');
  }

  const minDays = MIN_DAYS_BY_GOAL[config.goal];
  if (config.availableDaysPerWeek < minDays) {
    throw new InsufficientDaysError(config.availableDaysPerWeek, minDays);
  }

  if (!config.equipment || config.equipment.length === 0) {
    throw new InvalidConfigError('equipment must include at least one category. Use ["none"] for bodyweight-only.');
  }
}

function filterByEquipment(
  exerciseIds: { exerciseId: string; priority: number }[],
  availableEquipment: EquipmentCategory[],
  library: ExerciseLibrary,
): { exerciseIds: { exerciseId: string; priority: number }[]; filtered: { exerciseId: string; requiredEquipment: EquipmentCategory[] }[] } {
  const kept: { exerciseId: string; priority: number }[] = [];
  const filtered: { exerciseId: string; requiredEquipment: EquipmentCategory[] }[] = [];

  for (const item of exerciseIds) {
    const ex = library.findById(item.exerciseId);
    if (!ex) {
      filtered.push({ exerciseId: item.exerciseId, requiredEquipment: [] });
      continue;
    }
    const hasMatch = ex.equipment.some(
      (eq) => eq === 'none' || availableEquipment.includes(eq),
    );
    if (hasMatch) {
      kept.push(item);
    } else {
      filtered.push({ exerciseId: item.exerciseId, requiredEquipment: [...ex.equipment] });
    }
  }

  return { exerciseIds: kept, filtered };
}

function filterByLimitations(
  exerciseIds: { exerciseId: string; priority: number }[],
  limitations: BodyLimitation[],
  library: ExerciseLibrary,
): { exerciseIds: { exerciseId: string; priority: number }[]; filtered: { exerciseId: string; reason: string }[] } {
  if (!limitations || limitations.length === 0) return { exerciseIds, filtered: [] };

  const avoidedIds = new Set<string>();
  const reasonMap = new Map<string, string>();
  for (const lim of limitations) {
    for (const moveId of lim.movementsToAvoid) {
      avoidedIds.add(moveId);
      reasonMap.set(moveId, lim.area + '（' + lim.severity + '）限制');
    }
  }

  const kept: { exerciseId: string; priority: number }[] = [];
  const filtered: { exerciseId: string; reason: string }[] = [];

  for (const item of exerciseIds) {
    if (avoidedIds.has(item.exerciseId)) {
      filtered.push({ exerciseId: item.exerciseId, reason: reasonMap.get(item.exerciseId) || '身体限制' });
    } else {
      kept.push(item);
    }
  }

  return { exerciseIds: kept, filtered };
}

function applyPreferredExercises(
  exerciseIds: { exerciseId: string; priority: number }[],
  preferredIds: string[],
  library: ExerciseLibrary,
): { exerciseIds: { exerciseId: string; priority: number }[]; unavailablePreferred: string[] } {
  if (!preferredIds || preferredIds.length === 0) return { exerciseIds, unavailablePreferred: [] };

  const availableIds = new Set(exerciseIds.map((e) => e.exerciseId));
  const unavailablePreferred = preferredIds.filter((id) => !availableIds.has(id));

  const preferredSet = new Set(preferredIds);
  const result = exerciseIds.map((item) => ({
    ...item,
    priority: preferredSet.has(item.exerciseId) ? item.priority + 5 : item.priority,
  })).sort((a, b) => b.priority - a.priority);

  return { exerciseIds: result, unavailablePreferred };
}

function findReplacement(
  exerciseId: string,
  availableEquipment: EquipmentCategory[],
  limitations: BodyLimitation[],
  library: ExerciseLibrary,
): string | null {
  const avoidedIds = new Set<string>();
  for (const lim of limitations) {
    for (const moveId of lim.movementsToAvoid) {
      avoidedIds.add(moveId);
    }
  }

  const replacements = library.getReplacements(exerciseId, availableEquipment);
  const valid = replacements.find((r) => !avoidedIds.has(r.id));
  return valid ? valid.id : null;
}

function getBaseWeight(
  exerciseId: string,
  config: UserConfig,
  library: ExerciseLibrary,
): number {
  if (config.maxWeights && config.maxWeights[exerciseId] !== undefined) {
    return config.maxWeights[exerciseId];
  }

  const ex = library.findById(exerciseId);
  if (!ex) return 0;

  if (ex.category === 'stretch' || ex.category === 'warmup' || ex.category === 'cooldown') {
    return 0;
  }

  const bodyweight = config.bodyweight ?? 70;
  const isBodyweight = ex.equipment.includes('none') && ex.equipment.length === 1;

  if (isBodyweight) return 0;

  const weightByDifficulty: Record<DifficultyLevel, number> = {
    beginner: 0.3,
    intermediate: 0.5,
    advanced: 0.7,
  };

  if (ex.category === 'compound') {
    return Math.round(bodyweight * weightByDifficulty[config.difficulty] * 10) / 10;
  }
  return Math.round(bodyweight * weightByDifficulty[config.difficulty] * 0.4 * 10) / 10;
}

interface DayBuildResult {
  workout: WorkoutDay;
  warnings: PlanGenerationWarning[];
  alternatives: ExerciseAlternative[];
  unresolvable: UnresolvableDay | null;
}

function buildAvoidedIdSet(limitations: BodyLimitation[]): Set<string> {
  const avoidedIds = new Set<string>();
  for (const lim of limitations) {
    for (const moveId of lim.movementsToAvoid) {
      avoidedIds.add(moveId);
    }
  }
  return avoidedIds;
}

function buildWorkoutDay(
  dayIndex: number,
  dayTemplate: {
    muscleGroups: MuscleGroup[];
    exercisePriorities: { exerciseId: string; priority: number }[];
    label: string;
  },
  weekNumber: number,
  config: UserConfig,
  library: ExerciseLibrary,
): DayBuildResult {
  const warnings: PlanGenerationWarning[] = [];
  const alternatives: ExerciseAlternative[] = [];

  const isRestDay = dayIndex >= config.availableDaysPerWeek;
  const progConfig = getProgressionConfig(config.goal, config.difficulty);

  if (isRestDay) {
    return {
      workout: {
        dayOfWeek: dayIndex + 1,
        label: '休息日',
        isRestDay: true,
        muscleGroups: [],
        exercises: [],
        warmup: [],
        estimatedDurationMinutes: 0,
      },
      warnings: [],
      alternatives: [],
      unresolvable: null,
    };
  }

  const eqResult = filterByEquipment(dayTemplate.exercisePriorities, config.equipment, library);
  for (const f of eqResult.filtered) {
    const ex = library.findById(f.exerciseId);
    warnings.push({
      type: 'exercise_filtered',
      message: (ex ? ex.name : f.exerciseId) + '因器械不足被过滤',
      exerciseId: f.exerciseId,
      muscleGroups: ex ? ex.muscleGroups : undefined,
      suggestedEquipment: f.requiredEquipment.filter((eq) => eq !== 'none'),
    });

    if (ex) {
      const reps = library.getReplacements(f.exerciseId, config.equipment);
      const avoidedIds = buildAvoidedIdSet(config.limitations ?? []);
      const validReps = reps.filter((r) => !avoidedIds.has(r.id));
      if (validReps.length > 0) {
        alternatives.push({
          originalExerciseId: f.exerciseId,
          originalExerciseName: ex.name,
          reason: '器械不可用',
          alternatives: validReps,
        });
      }
    }
  }

  const limResult = filterByLimitations(eqResult.exerciseIds, config.limitations ?? [], library);
  for (const f of limResult.filtered) {
    const ex = library.findById(f.exerciseId);
    warnings.push({
      type: 'exercise_filtered',
      message: (ex ? ex.name : f.exerciseId) + '因身体限制被排除（' + f.reason + '）',
      exerciseId: f.exerciseId,
      muscleGroups: ex ? ex.muscleGroups : undefined,
    });

    if (ex) {
      const reps = library.getReplacements(f.exerciseId, config.equipment);
      const avoidedIds = buildAvoidedIdSet(config.limitations ?? []);
      const validReps = reps.filter((r) => !avoidedIds.has(r.id));
      if (validReps.length > 0) {
        alternatives.push({
          originalExerciseId: f.exerciseId,
          originalExerciseName: ex.name,
          reason: f.reason,
          alternatives: validReps,
        });
      }
    }
  }

  const prefResult = applyPreferredExercises(limResult.exerciseIds, config.preferredExerciseIds ?? [], library);
  for (const prefId of prefResult.unavailablePreferred) {
    const ex = library.findById(prefId);
    warnings.push({
      type: 'preferred_unavailable',
      message: '偏好动作' + (ex ? ex.name : prefId) + '在当前器械/限制下不可用',
      exerciseId: prefId,
      muscleGroups: ex ? ex.muscleGroups : undefined,
    });
  }

  const finalExercises = prefResult.exerciseIds.map((item) => {
    const ex = library.findById(item.exerciseId);
    if (ex) return item;
    const repId = findReplacement(item.exerciseId, config.equipment, config.limitations ?? [], library);
    return repId ? { exerciseId: repId, priority: item.priority } : null;
  }).filter((e): e is { exerciseId: string; priority: number } => e !== null);

  const maxExercises = config.difficulty === 'beginner' ? 4 : config.difficulty === 'intermediate' ? 6 : 8;
  const selectedExercises = finalExercises.slice(0, maxExercises);

  let unresolvable: UnresolvableDay | null = null;

  if (selectedExercises.length === 0) {
    const conflictingLimitations: string[] = [];
    for (const lim of (config.limitations ?? [])) {
      conflictingLimitations.push(...lim.movementsToAvoid);
    }
    const neededEquip = eqResult.filtered.flatMap((f) => f.requiredEquipment.filter((eq) => eq !== 'none'));
    const uniqueNeeded = [...new Set(neededEquip)];

    unresolvable = {
      dayIndex: dayIndex + 1,
      label: dayTemplate.label,
      targetMuscleGroups: dayTemplate.muscleGroups,
      reason: '无法为' + dayTemplate.label + '安排任何动作，当前器械条件下无可用动作',
      missingEquipment: uniqueNeeded,
      conflictingLimitations,
    };
    warnings.push({
      type: 'day_underpopulated',
      message: dayTemplate.label + '无可用动作，已转为休息日',
      muscleGroups: dayTemplate.muscleGroups,
      suggestedEquipment: uniqueNeeded,
    });

    return {
      workout: {
        dayOfWeek: dayIndex + 1,
        label: '休息日',
        isRestDay: true,
        muscleGroups: [],
        exercises: [],
        warmup: [],
        estimatedDurationMinutes: 0,
      },
      warnings,
      alternatives,
      unresolvable,
    };
  }

  const allSets: ExerciseSet[] = [];
  for (const sel of selectedExercises) {
    const baseWeight = getBaseWeight(sel.exerciseId, config, library);
    const sets = computeSetsForWeek(
      config.goal,
      config.difficulty,
      weekNumber,
      baseWeight,
      sel.exerciseId,
    );
    allSets.push(...sets);
  }

  const warmup = generateWarmup(dayTemplate.muscleGroups, config.goal, config.difficulty, library);
  const restTime = computeRestTime(config.goal, '');
  const duration = computeEstimatedDuration(
    selectedExercises.length,
    progConfig.baseSets,
    restTime,
    config.goal,
  );

  return {
    workout: {
      dayOfWeek: dayIndex + 1,
      label: dayTemplate.label,
      isRestDay: false,
      muscleGroups: dayTemplate.muscleGroups,
      exercises: allSets,
      warmup,
      estimatedDurationMinutes: duration,
    },
    warnings,
    alternatives,
    unresolvable,
  };
}

export function generatePlan(
  config: UserConfig,
  library: ExerciseLibrary,
  totalWeeks: number = DEFAULT_TOTAL_WEEKS,
): TrainingPlan {
  const result = generatePlanWithDiagnostics(config, library, totalWeeks);
  if (!result.plan) {
    throw new NoAvailableEquipmentError();
  }
  return result.plan;
}

export function generatePlanWithDiagnostics(
  config: UserConfig,
  library: ExerciseLibrary,
  totalWeeks: number = DEFAULT_TOTAL_WEEKS,
): PlanGenerationResult {
  validateConfig(config);

  const template = getTemplate(config.goal, config.availableDaysPerWeek, config.difficulty);

  const planId = 'plan_' + config.userId + '_' + Date.now();
  const now = new Date().toISOString();

  const allWarnings: PlanGenerationWarning[] = [];
  const allAlternatives: ExerciseAlternative[] = [];
  const allUnresolvable: UnresolvableDay[] = [];

  const weeks: TrainingWeek[] = [];
  for (let w = 1; w <= totalWeeks; w++) {
    const days: WorkoutDay[] = [];

    for (let d = 0; d < 7; d++) {
      const dayTemplateIndex = d % template.days.length;
      const dayTemplate = template.days[dayTemplateIndex];
      const dayResult = buildWorkoutDay(d, dayTemplate, w, config, library);
      days.push(dayResult.workout);

      if (w === 1) {
        allWarnings.push(...dayResult.warnings);
        allAlternatives.push(...dayResult.alternatives);
        if (dayResult.unresolvable) {
          allUnresolvable.push(dayResult.unresolvable);
        }
      }
    }

    let totalVolume = 0;
    for (const day of days) {
      for (const set of day.exercises) {
        totalVolume += set.targetWeight * set.targetReps;
      }
    }

    weeks.push({
      weekNumber: w,
      days,
      totalVolume: Math.round(totalVolume * 10) / 10,
      weeklyGoal: config.goal,
    });
  }

  const trainingDaysInWeek = weeks[0].days.filter((d) => !d.isRestDay && d.exercises.length > 0).length;
  const canProceed = trainingDaysInWeek > 0;

  const summary = buildSummary(allWarnings, allUnresolvable, canProceed, config);
  const remediationSuggestions = buildRemediationSuggestions(allUnresolvable, allWarnings, config);

  const configSnapshot: PlanConfigSnapshot = {
    goal: config.goal,
    availableDaysPerWeek: config.availableDaysPerWeek,
    equipment: [...config.equipment],
    limitations: config.limitations ? [...config.limitations] : [],
    preferredExerciseIds: config.preferredExerciseIds ? [...config.preferredExerciseIds] : [],
    difficulty: config.difficulty,
    bodyweight: config.bodyweight,
    sessionDurationMinutes: config.sessionDurationMinutes,
    unitSystem: config.unitSystem ?? 'metric',
  };

  const plan: TrainingPlan = {
    id: planId,
    userId: config.userId,
    goal: config.goal,
    weeks,
    createdAt: now,
    updatedAt: now,
    unitSystem: config.unitSystem ?? 'metric',
    difficulty: config.difficulty,
    totalWeeks,
    configSnapshot,
  };

  return {
    plan: canProceed ? plan : null,
    warnings: deduplicateWarnings(allWarnings),
    alternatives: deduplicateAlternatives(allAlternatives),
    unresolvableDays: allUnresolvable,
    remediationSuggestions,
    canProceed,
    summary,
  };
}

function buildSummary(
  warnings: PlanGenerationWarning[],
  unresolvable: UnresolvableDay[],
  canProceed: boolean,
  config: UserConfig,
): string {
  if (canProceed && warnings.length === 0) {
    return '计划生成成功，' + config.availableDaysPerWeek + '天/周' + config.goal + '训练计划已就绪';
  }

  const parts: string[] = [];

  if (!canProceed) {
    parts.push('无法生成有效训练计划');
  } else if (warnings.length > 0) {
    parts.push('计划已生成，但存在以下问题');
  }

  const filteredCount = warnings.filter((w) => w.type === 'exercise_filtered').length;
  const preferredCount = warnings.filter((w) => w.type === 'preferred_unavailable').length;
  const underpopCount = warnings.filter((w) => w.type === 'day_underpopulated').length;

  if (filteredCount > 0) {
    parts.push(filteredCount + '个动作因器械/限制被过滤');
  }
  if (preferredCount > 0) {
    parts.push(preferredCount + '个偏好动作不可用');
  }
  if (underpopCount > 0) {
    parts.push(underpopCount + '个训练日无法安排动作');
  }

  if (unresolvable.length > 0) {
    const allMissing = [...new Set(unresolvable.flatMap((d) => d.missingEquipment))];
    const allConflicts = [...new Set(unresolvable.flatMap((d) => d.conflictingLimitations))];
    if (allMissing.length > 0) {
      parts.push('建议增加器械：' + allMissing.join('、'));
    }
    if (allConflicts.length > 0) {
      parts.push('建议放宽对以下动作的限制：' + allConflicts.join('、'));
    }
  }

  return parts.join('；');
}

function deduplicateWarnings(warnings: PlanGenerationWarning[]): PlanGenerationWarning[] {
  const seen = new Set<string>();
  return warnings.filter((w) => {
    const key = w.type + '_' + (w.exerciseId ?? '') + '_' + w.message;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicateAlternatives(alternatives: ExerciseAlternative[]): ExerciseAlternative[] {
  const seen = new Set<string>();
  return alternatives.filter((a) => {
    if (seen.has(a.originalExerciseId)) return false;
    seen.add(a.originalExerciseId);
    return true;
  });
}

function buildRemediationSuggestions(
  unresolvable: UnresolvableDay[],
  warnings: PlanGenerationWarning[],
  config: UserConfig,
): RemediationSuggestion[] {
  const suggestions: RemediationSuggestion[] = [];

  const allMissingEquipment = [...new Set(unresolvable.flatMap((d) => d.missingEquipment))];
  if (allMissingEquipment.length > 0) {
    suggestions.push({
      type: 'add_equipment',
      description: '增加以下器械可解锁更多训练动作：' + allMissingEquipment.join('、'),
      impact: '可增加' + unresolvable.length + '个训练日的可用动作',
      missingEquipment: allMissingEquipment,
      suggestedConfig: {
        equipment: [...config.equipment, ...allMissingEquipment],
      },
    });
  }

  const allConflictingLimitations = [...new Set(unresolvable.flatMap((d) => d.conflictingLimitations))];
  if (allConflictingLimitations.length > 0 && config.limitations && config.limitations.length > 0) {
    const relaxedLimitations = config.limitations.map((lim) => ({
      ...lim,
      movementsToAvoid: lim.movementsToAvoid.filter((m) => !allConflictingLimitations.includes(m)),
    })).filter((lim) => lim.movementsToAvoid.length < (config.limitations?.find((l) => l.area === lim.area)?.movementsToAvoid.length ?? 0));
    suggestions.push({
      type: 'relax_limitation',
      description: '放宽对 ' + allConflictingLimitations.join('、') + ' 的限制后可安排更多动作',
      impact: '增加可用动作，丰富训练多样性',
      limitationToRelax: allConflictingLimitations[0],
      suggestedConfig: {
        limitations: config.limitations.map((lim) => ({
          ...lim,
          movementsToAvoid: lim.movementsToAvoid.filter((m) => !allConflictingLimitations.includes(m)),
        })),
      },
    });
  }

  const preferredUnavailable = warnings.filter((w) => w.type === 'preferred_unavailable');
  if (preferredUnavailable.length > 0) {
    const prefEquip = [...new Set(preferredUnavailable.flatMap((w) => w.suggestedEquipment ?? []))];
    if (prefEquip.length > 0) {
      suggestions.push({
        type: 'add_equipment',
        description: '增加以下器械可使用偏好动作：' + prefEquip.join('、'),
        impact: '提升训练体验和依从性',
        missingEquipment: prefEquip,
        suggestedConfig: {
          equipment: [...config.equipment, ...prefEquip],
        },
      });
    }
  }

  const minDays = MIN_DAYS_BY_GOAL[config.goal];
  if (unresolvable.length > 0 && config.availableDaysPerWeek > minDays) {
    suggestions.push({
      type: 'reduce_days',
      description: '可降级为每周' + minDays + '天训练，确保所有训练日都有充足动作',
      impact: '训练更聚焦，避免无动作的空训练日',
      reducedDays: minDays,
      suggestedConfig: {
        availableDaysPerWeek: minDays,
      },
    });
  }

  return suggestions;
}