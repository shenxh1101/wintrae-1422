import {
  FitnessGoal,
  MuscleGroup,
  WarmupSuggestion,
  DifficultyLevel,
} from '../types';
import { ExerciseLibrary } from '../exercise';

const goalWarmupMap: Partial<Record<FitnessGoal, { lightCardio: boolean; dynamicStretch: boolean; rampUpSets: boolean }>> = {
  strength: { lightCardio: true, dynamicStretch: true, rampUpSets: true },
  muscle_gain: { lightCardio: true, dynamicStretch: true, rampUpSets: true },
  fat_loss: { lightCardio: true, dynamicStretch: true, rampUpSets: false },
  endurance: { lightCardio: true, dynamicStretch: true, rampUpSets: false },
  flexibility: { lightCardio: false, dynamicStretch: true, rampUpSets: false },
  general_fitness: { lightCardio: true, dynamicStretch: true, rampUpSets: true },
};

export function generateWarmup(
  muscleGroups: MuscleGroup[],
  goal: FitnessGoal,
  difficulty: DifficultyLevel,
  library: ExerciseLibrary,
): WarmupSuggestion[] {
  const config = goalWarmupMap[goal] ?? { lightCardio: true, dynamicStretch: true, rampUpSets: false };
  const suggestions: WarmupSuggestion[] = [];

  if (config.lightCardio) {
    suggestions.push({
      exerciseId: '_warmup_cardio',
      exerciseName: '低强度有氧热身',
      sets: 1,
      reps: difficulty === 'beginner' ? 3 : 5,
      intensityPercent: 40,
      notes: '慢跑、跳绳或骑行，微微出汗即可',
    });
  }

  if (config.dynamicStretch) {
    suggestions.push({
      exerciseId: '_warmup_dynamic',
      exerciseName: '动态拉伸',
      sets: 1,
      reps: 8,
      intensityPercent: 30,
      notes: '针对目标肌群做动态拉伸，如手臂环绕、腿部摆动',
    });

    const warmupExercises = library.query({
      muscleGroups,
      category: 'warmup',
    });

    for (const ex of warmupExercises.slice(0, 2)) {
      suggestions.push({
        exerciseId: ex.id,
        exerciseName: ex.name,
        sets: 1,
        reps: difficulty === 'beginner' ? 8 : 10,
        intensityPercent: 30,
        notes: '使用较轻重量，感受肌肉激活',
      });
    }
  }

  if (config.rampUpSets) {
    suggestions.push({
      exerciseId: '_warmup_rampup',
      exerciseName: '递增热身组',
      sets: 2,
      reps: 5,
      intensityPercent: 50,
      notes: '第1组50%训练重量，第2组70%训练重量',
    });
  }

  return suggestions;
}
