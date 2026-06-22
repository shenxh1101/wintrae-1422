import {
  FitnessGoal,
  MuscleGroup,
  DifficultyLevel,
  TemplateConfig,
  WeightedExercise,
} from '../types';

interface DayTemplate {
  muscleGroups: MuscleGroup[];
  exercisePriorities: WeightedExercise[];
  label: string;
}

interface WeekTemplate {
  days: DayTemplate[];
}

const goalDayTemplates: Partial<Record<FitnessGoal, Record<number, DayTemplate[]>>> = {
  strength: {
    3: [
      {
        muscleGroups: ['chest', 'triceps', 'shoulders'],
        exercisePriorities: [
          { exerciseId: 'bench_press', priority: 10 },
          { exerciseId: 'overhead_press', priority: 8 },
          { exerciseId: 'tricep_pushdown', priority: 5 },
        ],
        label: '推力日',
      },
      {
        muscleGroups: ['back', 'biceps'],
        exercisePriorities: [
          { exerciseId: 'deadlift', priority: 10 },
          { exerciseId: 'barbell_row', priority: 8 },
          { exerciseId: 'bicep_curl', priority: 5 },
        ],
        label: '拉力日',
      },
      {
        muscleGroups: ['quads', 'hamstrings', 'glutes', 'calves'],
        exercisePriorities: [
          { exerciseId: 'barbell_squat', priority: 10 },
          { exerciseId: 'romanian_deadlift', priority: 8 },
          { exerciseId: 'calf_raise', priority: 4 },
        ],
        label: '腿部日',
      },
    ],
    4: [
      {
        muscleGroups: ['chest', 'triceps'],
        exercisePriorities: [
          { exerciseId: 'bench_press', priority: 10 },
          { exerciseId: 'dumbbell_bench_press', priority: 7 },
          { exerciseId: 'tricep_pushdown', priority: 5 },
        ],
        label: '胸+三头',
      },
      {
        muscleGroups: ['back', 'biceps'],
        exercisePriorities: [
          { exerciseId: 'pull_up', priority: 10 },
          { exerciseId: 'barbell_row', priority: 8 },
          { exerciseId: 'bicep_curl', priority: 5 },
        ],
        label: '背+二头',
      },
      {
        muscleGroups: ['quads', 'calves'],
        exercisePriorities: [
          { exerciseId: 'barbell_squat', priority: 10 },
          { exerciseId: 'leg_extension', priority: 6 },
          { exerciseId: 'calf_raise', priority: 4 },
        ],
        label: '股四头+小腿',
      },
      {
        muscleGroups: ['hamstrings', 'glutes', 'shoulders'],
        exercisePriorities: [
          { exerciseId: 'romanian_deadlift', priority: 10 },
          { exerciseId: 'hip_thrust', priority: 8 },
          { exerciseId: 'overhead_press', priority: 7 },
        ],
        label: '后链+肩',
      },
    ],
    5: [
      {
        muscleGroups: ['chest'],
        exercisePriorities: [
          { exerciseId: 'bench_press', priority: 10 },
          { exerciseId: 'chest_fly', priority: 6 },
        ],
        label: '胸',
      },
      {
        muscleGroups: ['back'],
        exercisePriorities: [
          { exerciseId: 'pull_up', priority: 10 },
          { exerciseId: 'barbell_row', priority: 8 },
        ],
        label: '背',
      },
      {
        muscleGroups: ['shoulders', 'traps'],
        exercisePriorities: [
          { exerciseId: 'overhead_press', priority: 10 },
          { exerciseId: 'lateral_raise', priority: 7 },
          { exerciseId: 'face_pull', priority: 5 },
        ],
        label: '肩',
      },
      {
        muscleGroups: ['quads', 'hamstrings', 'glutes'],
        exercisePriorities: [
          { exerciseId: 'barbell_squat', priority: 10 },
          { exerciseId: 'romanian_deadlift', priority: 8 },
          { exerciseId: 'leg_curl', priority: 5 },
        ],
        label: '腿',
      },
      {
        muscleGroups: ['biceps', 'triceps', 'core'],
        exercisePriorities: [
          { exerciseId: 'bicep_curl', priority: 7 },
          { exerciseId: 'tricep_pushdown', priority: 7 },
          { exerciseId: 'plank', priority: 5 },
        ],
        label: '手臂+核心',
      },
    ],
    6: [
      {
        muscleGroups: ['chest', 'triceps'],
        exercisePriorities: [
          { exerciseId: 'bench_press', priority: 10 },
          { exerciseId: 'dumbbell_bench_press', priority: 7 },
          { exerciseId: 'tricep_pushdown', priority: 5 },
        ],
        label: '胸+三头A',
      },
      {
        muscleGroups: ['back', 'biceps'],
        exercisePriorities: [
          { exerciseId: 'pull_up', priority: 10 },
          { exerciseId: 'barbell_row', priority: 8 },
          { exerciseId: 'bicep_curl', priority: 5 },
        ],
        label: '背+二头A',
      },
      {
        muscleGroups: ['quads', 'glutes'],
        exercisePriorities: [
          { exerciseId: 'barbell_squat', priority: 10 },
          { exerciseId: 'lunge', priority: 7 },
          { exerciseId: 'leg_extension', priority: 5 },
        ],
        label: '腿A',
      },
      {
        muscleGroups: ['chest', 'shoulders'],
        exercisePriorities: [
          { exerciseId: 'dumbbell_bench_press', priority: 8 },
          { exerciseId: 'overhead_press', priority: 8 },
          { exerciseId: 'lateral_raise', priority: 5 },
        ],
        label: '胸+肩B',
      },
      {
        muscleGroups: ['back', 'traps'],
        exercisePriorities: [
          { exerciseId: 'deadlift', priority: 10 },
          { exerciseId: 'cable_row', priority: 7 },
          { exerciseId: 'face_pull', priority: 5 },
        ],
        label: '背+后链B',
      },
      {
        muscleGroups: ['hamstrings', 'calves', 'core'],
        exercisePriorities: [
          { exerciseId: 'romanian_deadlift', priority: 10 },
          { exerciseId: 'calf_raise', priority: 4 },
          { exerciseId: 'plank', priority: 5 },
        ],
        label: '后链+核心B',
      },
    ],
  },
  muscle_gain: {
    3: [
      {
        muscleGroups: ['chest', 'back', 'shoulders'],
        exercisePriorities: [
          { exerciseId: 'bench_press', priority: 10 },
          { exerciseId: 'barbell_row', priority: 9 },
          { exerciseId: 'overhead_press', priority: 7 },
          { exerciseId: 'lateral_raise', priority: 5 },
        ],
        label: '上肢推拉',
      },
      {
        muscleGroups: ['quads', 'hamstrings', 'glutes', 'calves'],
        exercisePriorities: [
          { exerciseId: 'barbell_squat', priority: 10 },
          { exerciseId: 'romanian_deadlift', priority: 8 },
          { exerciseId: 'calf_raise', priority: 4 },
        ],
        label: '下肢',
      },
      {
        muscleGroups: ['chest', 'back', 'biceps', 'triceps'],
        exercisePriorities: [
          { exerciseId: 'dumbbell_bench_press', priority: 8 },
          { exerciseId: 'lat_pulldown', priority: 8 },
          { exerciseId: 'bicep_curl', priority: 6 },
          { exerciseId: 'tricep_pushdown', priority: 6 },
        ],
        label: '上肢肌肥大',
      },
    ],
    4: [
      {
        muscleGroups: ['chest', 'triceps'],
        exercisePriorities: [
          { exerciseId: 'bench_press', priority: 10 },
          { exerciseId: 'chest_fly', priority: 7 },
          { exerciseId: 'tricep_pushdown', priority: 6 },
        ],
        label: '胸+三头',
      },
      {
        muscleGroups: ['back', 'biceps'],
        exercisePriorities: [
          { exerciseId: 'barbell_row', priority: 10 },
          { exerciseId: 'lat_pulldown', priority: 7 },
          { exerciseId: 'bicep_curl', priority: 6 },
        ],
        label: '背+二头',
      },
      {
        muscleGroups: ['quads', 'glutes', 'calves'],
        exercisePriorities: [
          { exerciseId: 'barbell_squat', priority: 10 },
          { exerciseId: 'leg_extension', priority: 6 },
          { exerciseId: 'calf_raise', priority: 4 },
        ],
        label: '股四+小腿',
      },
      {
        muscleGroups: ['hamstrings', 'glutes', 'shoulders', 'core'],
        exercisePriorities: [
          { exerciseId: 'romanian_deadlift', priority: 10 },
          { exerciseId: 'overhead_press', priority: 7 },
          { exerciseId: 'plank', priority: 4 },
        ],
        label: '后链+肩+核心',
      },
    ],
    5: [
      {
        muscleGroups: ['chest'],
        exercisePriorities: [
          { exerciseId: 'bench_press', priority: 10 },
          { exerciseId: 'dumbbell_bench_press', priority: 7 },
          { exerciseId: 'chest_fly', priority: 6 },
        ],
        label: '胸',
      },
      {
        muscleGroups: ['back'],
        exercisePriorities: [
          { exerciseId: 'barbell_row', priority: 10 },
          { exerciseId: 'lat_pulldown', priority: 7 },
          { exerciseId: 'cable_row', priority: 6 },
        ],
        label: '背',
      },
      {
        muscleGroups: ['shoulders', 'traps'],
        exercisePriorities: [
          { exerciseId: 'overhead_press', priority: 10 },
          { exerciseId: 'lateral_raise', priority: 7 },
          { exerciseId: 'face_pull', priority: 5 },
        ],
        label: '肩',
      },
      {
        muscleGroups: ['quads', 'hamstrings', 'glutes'],
        exercisePriorities: [
          { exerciseId: 'barbell_squat', priority: 10 },
          { exerciseId: 'hip_thrust', priority: 8 },
          { exerciseId: 'leg_curl', priority: 5 },
        ],
        label: '腿',
      },
      {
        muscleGroups: ['biceps', 'triceps', 'core'],
        exercisePriorities: [
          { exerciseId: 'bicep_curl', priority: 8 },
          { exerciseId: 'skull_crusher', priority: 8 },
          { exerciseId: 'plank', priority: 5 },
        ],
        label: '手臂+核心',
      },
    ],
    6: [
      {
        muscleGroups: ['chest', 'triceps'],
        exercisePriorities: [
          { exerciseId: 'bench_press', priority: 10 },
          { exerciseId: 'chest_fly', priority: 6 },
          { exerciseId: 'tricep_pushdown', priority: 5 },
        ],
        label: '胸+三头A',
      },
      {
        muscleGroups: ['back', 'biceps'],
        exercisePriorities: [
          { exerciseId: 'barbell_row', priority: 10 },
          { exerciseId: 'lat_pulldown', priority: 7 },
          { exerciseId: 'dumbbell_curl', priority: 5 },
        ],
        label: '背+二头A',
      },
      {
        muscleGroups: ['quads', 'glutes'],
        exercisePriorities: [
          { exerciseId: 'barbell_squat', priority: 10 },
          { exerciseId: 'bulgarian_split_squat', priority: 7 },
          { exerciseId: 'leg_extension', priority: 5 },
        ],
        label: '腿A',
      },
      {
        muscleGroups: ['chest', 'shoulders'],
        exercisePriorities: [
          { exerciseId: 'dumbbell_bench_press', priority: 8 },
          { exerciseId: 'overhead_press', priority: 8 },
          { exerciseId: 'lateral_raise', priority: 5 },
        ],
        label: '胸+肩B',
      },
      {
        muscleGroups: ['back', 'traps'],
        exercisePriorities: [
          { exerciseId: 'cable_row', priority: 8 },
          { exerciseId: 'face_pull', priority: 5 },
        ],
        label: '背+后链B',
      },
      {
        muscleGroups: ['hamstrings', 'calves', 'core'],
        exercisePriorities: [
          { exerciseId: 'romanian_deadlift', priority: 10 },
          { exerciseId: 'calf_raise', priority: 4 },
          { exerciseId: 'dead_bug', priority: 5 },
        ],
        label: '后链+核心B',
      },
    ],
  },
  fat_loss: {
    3: [
      {
        muscleGroups: ['chest', 'back', 'shoulders'],
        exercisePriorities: [
          { exerciseId: 'bench_press', priority: 8 },
          { exerciseId: 'barbell_row', priority: 8 },
          { exerciseId: 'push_up', priority: 7 },
        ],
        label: '上肢循环',
      },
      {
        muscleGroups: ['quads', 'hamstrings', 'glutes'],
        exercisePriorities: [
          { exerciseId: 'barbell_squat', priority: 8 },
          { exerciseId: 'lunge', priority: 7 },
          { exerciseId: 'glute_bridge', priority: 5 },
        ],
        label: '下肢循环',
      },
      {
        muscleGroups: ['core', 'shoulders', 'calves'],
        exercisePriorities: [
          { exerciseId: 'plank', priority: 6 },
          { exerciseId: 'overhead_press', priority: 6 },
          { exerciseId: 'calf_raise', priority: 4 },
        ],
        label: '全身循环',
      },
    ],
    4: [
      {
        muscleGroups: ['chest', 'back'],
        exercisePriorities: [
          { exerciseId: 'bench_press', priority: 8 },
          { exerciseId: 'barbell_row', priority: 8 },
        ],
        label: '上肢推拉',
      },
      {
        muscleGroups: ['quads', 'glutes'],
        exercisePriorities: [
          { exerciseId: 'barbell_squat', priority: 8 },
          { exerciseId: 'lunge', priority: 7 },
        ],
        label: '下肢前侧',
      },
      {
        muscleGroups: ['shoulders', 'core'],
        exercisePriorities: [
          { exerciseId: 'overhead_press', priority: 7 },
          { exerciseId: 'plank', priority: 6 },
        ],
        label: '肩+核心',
      },
      {
        muscleGroups: ['hamstrings', 'back', 'glutes'],
        exercisePriorities: [
          { exerciseId: 'romanian_deadlift', priority: 8 },
          { exerciseId: 'glute_bridge', priority: 6 },
        ],
        label: '后链',
      },
    ],
    5: [
      {
        muscleGroups: ['chest', 'triceps'],
        exercisePriorities: [
          { exerciseId: 'bench_press', priority: 8 },
          { exerciseId: 'push_up', priority: 7 },
        ],
        label: '胸+三头',
      },
      {
        muscleGroups: ['back', 'biceps'],
        exercisePriorities: [
          { exerciseId: 'barbell_row', priority: 8 },
          { exerciseId: 'lat_pulldown', priority: 7 },
        ],
        label: '背+二头',
      },
      {
        muscleGroups: ['quads', 'glutes'],
        exercisePriorities: [
          { exerciseId: 'barbell_squat', priority: 8 },
          { exerciseId: 'lunge', priority: 7 },
        ],
        label: '腿前侧',
      },
      {
        muscleGroups: ['hamstrings', 'shoulders'],
        exercisePriorities: [
          { exerciseId: 'romanian_deadlift', priority: 8 },
          { exerciseId: 'overhead_press', priority: 7 },
        ],
        label: '后链+肩',
      },
      {
        muscleGroups: ['core', 'calves'],
        exercisePriorities: [
          { exerciseId: 'plank', priority: 6 },
          { exerciseId: 'calf_raise', priority: 4 },
        ],
        label: '核心+小腿',
      },
    ],
  },
  endurance: {
    3: [
      {
        muscleGroups: ['chest', 'back', 'shoulders'],
        exercisePriorities: [
          { exerciseId: 'push_up', priority: 8 },
          { exerciseId: 'inverted_row', priority: 8 },
          { exerciseId: 'dumbbell_shoulder_press', priority: 6 },
        ],
        label: '上肢耐力',
      },
      {
        muscleGroups: ['quads', 'hamstrings', 'glutes'],
        exercisePriorities: [
          { exerciseId: 'bodyweight_squat', priority: 8 },
          { exerciseId: 'lunge', priority: 7 },
          { exerciseId: 'glute_bridge', priority: 5 },
        ],
        label: '下肢耐力',
      },
      {
        muscleGroups: ['core'],
        exercisePriorities: [
          { exerciseId: 'plank', priority: 7 },
          { exerciseId: 'dead_bug', priority: 6 },
          { exerciseId: 'bird_dog', priority: 5 },
        ],
        label: '核心耐力',
      },
    ],
    4: [
      {
        muscleGroups: ['chest', 'shoulders'],
        exercisePriorities: [
          { exerciseId: 'push_up', priority: 8 },
          { exerciseId: 'dumbbell_shoulder_press', priority: 6 },
        ],
        label: '推力耐力',
      },
      {
        muscleGroups: ['back', 'biceps'],
        exercisePriorities: [
          { exerciseId: 'inverted_row', priority: 8 },
          { exerciseId: 'dumbbell_curl', priority: 5 },
        ],
        label: '拉力耐力',
      },
      {
        muscleGroups: ['quads', 'glutes'],
        exercisePriorities: [
          { exerciseId: 'bodyweight_squat', priority: 8 },
          { exerciseId: 'lunge', priority: 7 },
        ],
        label: '下肢前侧',
      },
      {
        muscleGroups: ['hamstrings', 'core'],
        exercisePriorities: [
          { exerciseId: 'romanian_deadlift', priority: 7 },
          { exerciseId: 'plank', priority: 6 },
        ],
        label: '后链+核心',
      },
    ],
  },
  flexibility: {
    3: [
      {
        muscleGroups: ['chest', 'shoulders', 'back'],
        exercisePriorities: [
          { exerciseId: 'push_up', priority: 5 },
          { exerciseId: 'face_pull', priority: 5 },
        ],
        label: '上肢柔韧',
      },
      {
        muscleGroups: ['quads', 'hamstrings', 'glutes', 'hip_flexors'],
        exercisePriorities: [
          { exerciseId: 'bodyweight_squat', priority: 5 },
          { exerciseId: 'lunge', priority: 5 },
        ],
        label: '下肢柔韧',
      },
      {
        muscleGroups: ['core', 'hip_flexors'],
        exercisePriorities: [
          { exerciseId: 'plank', priority: 4 },
          { exerciseId: 'bird_dog', priority: 5 },
        ],
        label: '核心+髋部柔韧',
      },
    ],
  },
  general_fitness: {
    3: [
      {
        muscleGroups: ['chest', 'back', 'shoulders'],
        exercisePriorities: [
          { exerciseId: 'bench_press', priority: 8 },
          { exerciseId: 'barbell_row', priority: 8 },
          { exerciseId: 'overhead_press', priority: 6 },
        ],
        label: '上肢',
      },
      {
        muscleGroups: ['quads', 'hamstrings', 'glutes'],
        exercisePriorities: [
          { exerciseId: 'barbell_squat', priority: 8 },
          { exerciseId: 'romanian_deadlift', priority: 7 },
        ],
        label: '下肢',
      },
      {
        muscleGroups: ['core', 'biceps', 'triceps'],
        exercisePriorities: [
          { exerciseId: 'plank', priority: 5 },
          { exerciseId: 'bicep_curl', priority: 5 },
          { exerciseId: 'tricep_pushdown', priority: 5 },
        ],
        label: '核心+手臂',
      },
    ],
    4: [
      {
        muscleGroups: ['chest', 'triceps'],
        exercisePriorities: [
          { exerciseId: 'bench_press', priority: 8 },
          { exerciseId: 'push_up', priority: 6 },
        ],
        label: '胸+三头',
      },
      {
        muscleGroups: ['back', 'biceps'],
        exercisePriorities: [
          { exerciseId: 'barbell_row', priority: 8 },
          { exerciseId: 'bicep_curl', priority: 5 },
        ],
        label: '背+二头',
      },
      {
        muscleGroups: ['quads', 'glutes', 'calves'],
        exercisePriorities: [
          { exerciseId: 'barbell_squat', priority: 8 },
          { exerciseId: 'calf_raise', priority: 4 },
        ],
        label: '腿前侧',
      },
      {
        muscleGroups: ['hamstrings', 'shoulders', 'core'],
        exercisePriorities: [
          { exerciseId: 'romanian_deadlift', priority: 7 },
          { exerciseId: 'overhead_press', priority: 7 },
          { exerciseId: 'plank', priority: 4 },
        ],
        label: '后链+肩+核心',
      },
    ],
  },
};

export function getTemplate(
  goal: FitnessGoal,
  daysPerWeek: number,
  difficulty: DifficultyLevel,
): WeekTemplate {
  const goalTemplates = goalDayTemplates[goal] ?? goalDayTemplates.general_fitness!;
  const closestDayCount = Object.keys(goalTemplates)
    .map(Number)
    .sort((a, b) => Math.abs(a - daysPerWeek) - Math.abs(b - daysPerWeek))[0];

  let dayTemplates = goalTemplates[closestDayCount] ?? goalTemplates[3]!;

  if (closestDayCount !== daysPerWeek) {
    if (daysPerWeek < closestDayCount) {
      dayTemplates = dayTemplates.slice(0, daysPerWeek);
    } else {
      const extraNeeded = daysPerWeek - dayTemplates.length;
      for (let i = 0; i < extraNeeded; i++) {
        dayTemplates.push({
          ...dayTemplates[i % dayTemplates.length],
          label: `${dayTemplates[i % dayTemplates.length].label} B`,
        });
      }
    }
  }

  if (difficulty === 'beginner') {
    dayTemplates = dayTemplates.map((d) => ({
      ...d,
      exercisePriorities: d.exercisePriorities.slice(
        0,
        Math.max(2, d.exercisePriorities.length - 1),
      ),
    }));
  }

  return { days: dayTemplates };
}

export function getDefaultTemplateConfig(
  goal: FitnessGoal,
  daysPerWeek: number,
  difficulty: DifficultyLevel,
): TemplateConfig {
  return {
    goal,
    daysPerWeek,
    difficulty,
    name: `${goalLabel(goal)} - ${daysPerWeek}天/周 - ${difficultyLabel(difficulty)}`,
    description: `为${goalLabel(goal)}目标设计的${daysPerWeek}天/周${difficultyLabel(difficulty)}训练模板`,
  };
}

function goalLabel(goal: FitnessGoal): string {
  const map: Record<FitnessGoal, string> = {
    strength: '力量提升',
    muscle_gain: '增肌塑形',
    fat_loss: '减脂塑形',
    endurance: '耐力提升',
    flexibility: '柔韧提升',
    general_fitness: '综合体能',
  };
  return map[goal];
}

function difficultyLabel(d: DifficultyLevel): string {
  const map: Record<DifficultyLevel, string> = {
    beginner: '入门',
    intermediate: '进阶',
    advanced: '高级',
  };
  return map[d];
}
