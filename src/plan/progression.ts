import { FitnessGoal, DifficultyLevel, ExerciseSet } from '../types';

interface ProgressionConfig {
  baseSets: number;
  baseReps: number;
  weeklySetIncrease: number;
  weeklyRepIncrease: number;
  weeklyWeightIncreasePercent: number;
  deloadWeek: number;
}

const goalProgression: Record<FitnessGoal, ProgressionConfig> = {
  strength: {
    baseSets: 4,
    baseReps: 5,
    weeklySetIncrease: 0,
    weeklyRepIncrease: 0,
    weeklyWeightIncreasePercent: 2.5,
    deloadWeek: 5,
  },
  muscle_gain: {
    baseSets: 3,
    baseReps: 10,
    weeklySetIncrease: 1,
    weeklyRepIncrease: 0,
    weeklyWeightIncreasePercent: 2,
    deloadWeek: 5,
  },
  fat_loss: {
    baseSets: 3,
    baseReps: 12,
    weeklySetIncrease: 0,
    weeklyRepIncrease: 2,
    weeklyWeightIncreasePercent: 0,
    deloadWeek: 6,
  },
  endurance: {
    baseSets: 3,
    baseReps: 15,
    weeklySetIncrease: 0,
    weeklyRepIncrease: 3,
    weeklyWeightIncreasePercent: 0,
    deloadWeek: 6,
  },
  flexibility: {
    baseSets: 2,
    baseReps: 15,
    weeklySetIncrease: 0,
    weeklyRepIncrease: 2,
    weeklyWeightIncreasePercent: 0,
    deloadWeek: 0,
  },
  general_fitness: {
    baseSets: 3,
    baseReps: 10,
    weeklySetIncrease: 0,
    weeklyRepIncrease: 1,
    weeklyWeightIncreasePercent: 1.5,
    deloadWeek: 6,
  },
};

export function getProgressionConfig(goal: FitnessGoal, difficulty: DifficultyLevel): ProgressionConfig {
  const config = { ...goalProgression[goal] };

  if (difficulty === 'beginner') {
    config.baseSets = Math.max(2, config.baseSets - 1);
    config.weeklyWeightIncreasePercent *= 0.5;
  } else if (difficulty === 'advanced') {
    config.baseSets += 1;
    config.weeklyWeightIncreasePercent *= 1.5;
  }

  return config;
}

export function computeSetsForWeek(
  goal: FitnessGoal,
  difficulty: DifficultyLevel,
  weekNumber: number,
  baseWeight: number,
  exerciseId: string,
): ExerciseSet[] {
  const config = getProgressionConfig(goal, difficulty);
  const isDeload = config.deloadWeek > 0 && weekNumber % config.deloadWeek === 0;

  let sets = config.baseSets;
  let reps = config.baseReps;
  let weight = baseWeight;

  if (!isDeload) {
    sets += config.weeklySetIncrease * (weekNumber - 1);
    reps += config.weeklyRepIncrease * (weekNumber - 1);
    weight *= 1 + (config.weeklyWeightIncreasePercent / 100) * (weekNumber - 1);
  } else {
    sets = Math.max(2, Math.floor(sets * 0.6));
    reps = Math.max(5, Math.floor(reps * 0.7));
    weight *= 0.7;
  }

  weight = Math.round(weight * 10) / 10;

  const exerciseSets: ExerciseSet[] = [];
  for (let i = 0; i < sets; i++) {
    exerciseSets.push({
      exerciseId,
      setIndex: i + 1,
      targetReps: reps,
      targetWeight: weight,
      restSeconds: computeRestTime(goal, exerciseId),
      completed: false,
    });
  }

  return exerciseSets;
}

export function computeRestTime(goal: FitnessGoal, _exerciseId: string): number {
  switch (goal) {
    case 'strength':
      return 180;
    case 'muscle_gain':
      return 90;
    case 'fat_loss':
      return 45;
    case 'endurance':
      return 30;
    case 'flexibility':
      return 30;
    case 'general_fitness':
      return 60;
    default:
      return 60;
  }
}

export function computeEstimatedDuration(
  exerciseCount: number,
  setsPerExercise: number,
  restSeconds: number,
  goal: FitnessGoal,
): number {
  const setDurationSeconds = goal === 'strength' ? 30 : 45;
  const totalSets = exerciseCount * setsPerExercise;
  const workingSeconds = totalSets * setDurationSeconds;
  const restTotalSeconds = Math.max(0, totalSets - 1) * restSeconds;
  const warmupMinutes = 8;
  const cooldownMinutes = 5;
  return Math.ceil((workingSeconds + restTotalSeconds) / 60 + warmupMinutes + cooldownMinutes);
}
