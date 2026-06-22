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
): { exerciseId: string; priority: number }[] {
  return exerciseIds.filter((item) => {
    const ex = library.findById(item.exerciseId);
    if (!ex) return false;
    return ex.equipment.some(
      (eq) => eq === 'none' || availableEquipment.includes(eq),
    );
  });
}

function filterByLimitations(
  exerciseIds: { exerciseId: string; priority: number }[],
  limitations: BodyLimitation[],
  library: ExerciseLibrary,
): { exerciseId: string; priority: number }[] {
  if (!limitations || limitations.length === 0) return exerciseIds;

  const avoidedIds = new Set<string>();
  for (const lim of limitations) {
    for (const moveId of lim.movementsToAvoid) {
      avoidedIds.add(moveId);
    }
  }

  return exerciseIds.filter((item) => !avoidedIds.has(item.exerciseId));
}

function applyPreferredExercises(
  exerciseIds: { exerciseId: string; priority: number }[],
  preferredIds: string[],
): { exerciseId: string; priority: number }[] {
  if (!preferredIds || preferredIds.length === 0) return exerciseIds;

  const preferredSet = new Set(preferredIds);
  return exerciseIds.map((item) => ({
    ...item,
    priority: preferredSet.has(item.exerciseId) ? item.priority + 5 : item.priority,
  })).sort((a, b) => b.priority - a.priority);
}

function findReplacement(
  exerciseId: string,
  availableEquipment: EquipmentCategory[],
  limitations: BodyLimitation[],
  library: ExerciseLibrary,
): string | null {
  const replacements = library.getReplacements(exerciseId, availableEquipment);
  const avoidedIds = new Set<string>();
  for (const lim of limitations) {
    for (const moveId of lim.movementsToAvoid) {
      avoidedIds.add(moveId);
    }
  }
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
  totalDays: number,
): WorkoutDay {
  const isRestDay = dayIndex >= config.availableDaysPerWeek;
  const progConfig = getProgressionConfig(config.goal, config.difficulty);

  if (isRestDay) {
    return {
      dayOfWeek: dayIndex + 1,
      label: '休息日',
      isRestDay: true,
      muscleGroups: [],
      exercises: [],
      warmup: [],
      estimatedDurationMinutes: 0,
    };
  }

  let exercises = filterByEquipment(dayTemplate.exercisePriorities, config.equipment, library);
  exercises = filterByLimitations(exercises, config.limitations ?? [], library);
  exercises = applyPreferredExercises(exercises, config.preferredExerciseIds ?? []);

  const finalExercises = exercises.map((item) => {
    const ex = library.findById(item.exerciseId);
    if (ex) return item;
    const repId = findReplacement(item.exerciseId, config.equipment, config.limitations ?? [], library);
    return repId ? { exerciseId: repId, priority: item.priority } : null;
  }).filter((e): e is { exerciseId: string; priority: number } => e !== null);

  const maxExercises = config.difficulty === 'beginner' ? 4 : config.difficulty === 'intermediate' ? 6 : 8;
  const selectedExercises = finalExercises.slice(0, maxExercises);

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
    dayOfWeek: dayIndex + 1,
    label: dayTemplate.label,
    isRestDay: false,
    muscleGroups: dayTemplate.muscleGroups,
    exercises: allSets,
    warmup,
    estimatedDurationMinutes: duration,
  };
}

export function generatePlan(
  config: UserConfig,
  library: ExerciseLibrary,
  totalWeeks: number = DEFAULT_TOTAL_WEEKS,
): TrainingPlan {
  validateConfig(config);

  const template = getTemplate(config.goal, config.availableDaysPerWeek, config.difficulty);

  const planId = `plan_${config.userId}_${Date.now()}`;
  const now = new Date().toISOString();

  const weeks: TrainingWeek[] = [];
  for (let w = 1; w <= totalWeeks; w++) {
    const days: WorkoutDay[] = [];

    for (let d = 0; d < 7; d++) {
      const dayTemplateIndex = d % template.days.length;
      const dayTemplate = template.days[dayTemplateIndex];
      const workout = buildWorkoutDay(
        d,
        dayTemplate,
        w,
        config,
        library,
        config.availableDaysPerWeek,
      );
      days.push(workout);
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

  return {
    id: planId,
    userId: config.userId,
    goal: config.goal,
    weeks,
    createdAt: now,
    updatedAt: now,
    unitSystem: config.unitSystem ?? 'metric',
    difficulty: config.difficulty,
    totalWeeks,
  };
}
