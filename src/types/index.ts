export type FitnessGoal =
  | 'strength'
  | 'muscle_gain'
  | 'fat_loss'
  | 'endurance'
  | 'flexibility'
  | 'general_fitness';

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'core'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'forearms'
  | 'traps'
  | 'hip_flexors'
  | 'adductors'
  | 'abductors';

export type EquipmentCategory =
  | 'barbell'
  | 'dumbbell'
  | 'kettlebell'
  | 'cable'
  | 'machine'
  | 'bodyweight'
  | 'resistance_band'
  | 'pull_up_bar'
  | 'bench'
  | 'smith_machine'
  | 'none';

export type ExerciseCategory =
  | 'compound'
  | 'isolation'
  | 'cardio'
  | 'stretch'
  | 'warmup'
  | 'cooldown';

export type UnitSystem = 'metric' | 'imperial';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

export type FatigueLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface BodyLimitation {
  area: string;
  severity: 'mild' | 'moderate' | 'severe';
  movementsToAvoid: string[];
}

export interface Exercise {
  id: string;
  name: string;
  nameEn: string;
  category: ExerciseCategory;
  muscleGroups: MuscleGroup[];
  equipment: EquipmentCategory[];
  difficulty: DifficultyLevel;
  instructions: string[];
  replacementIds: string[];
  isCustom: boolean;
}

export interface ExerciseSet {
  exerciseId: string;
  setIndex: number;
  targetReps: number;
  targetWeight: number;
  actualReps?: number;
  actualWeight?: number;
  restSeconds: number;
  completed: boolean;
}

export interface WarmupSuggestion {
  exerciseId: string;
  exerciseName: string;
  sets: number;
  reps: number;
  intensityPercent: number;
  notes: string;
}

export interface WorkoutDay {
  dayOfWeek: number;
  label: string;
  isRestDay: boolean;
  muscleGroups: MuscleGroup[];
  exercises: ExerciseSet[];
  warmup: WarmupSuggestion[];
  estimatedDurationMinutes: number;
}

export interface TrainingWeek {
  weekNumber: number;
  days: WorkoutDay[];
  totalVolume: number;
  weeklyGoal: FitnessGoal;
}

export interface TrainingPlan {
  id: string;
  userId: string;
  goal: FitnessGoal;
  weeks: TrainingWeek[];
  createdAt: string;
  updatedAt: string;
  unitSystem: UnitSystem;
  difficulty: DifficultyLevel;
  totalWeeks: number;
}

export interface UserConfig {
  userId: string;
  goal: FitnessGoal;
  availableDaysPerWeek: number;
  equipment: EquipmentCategory[];
  limitations: BodyLimitation[];
  preferredExerciseIds: string[];
  difficulty: DifficultyLevel;
  sessionDurationMinutes?: number;
  unitSystem?: UnitSystem;
  bodyweight?: number;
  maxWeights?: Record<string, number>;
}

export interface TrainingRecord {
  id: string;
  planId: string;
  weekNumber: number;
  dayOfWeek: number;
  exerciseId: string;
  setIndex: number;
  actualReps: number;
  actualWeight: number;
  completedAt: string;
  restTakenSeconds: number;
}

export interface FatigueFeedback {
  planId: string;
  weekNumber: number;
  overallFatigue: FatigueLevel;
  muscleFatigue?: Partial<Record<MuscleGroup, FatigueLevel>>;
  sleepQuality: FatigueLevel;
  motivationLevel: FatigueLevel;
  notes?: string;
  submittedAt?: string;
}

export interface WeeklyReport {
  planId: string;
  weekNumber: number;
  completionRate: number;
  totalVolume: number;
  totalSets: number;
  totalReps: number;
  averageWeight: number;
  personalRecords: PersonalRecord[];
  muscleGroupDistribution: Partial<Record<MuscleGroup, number>>;
  fatigueTrend: FatigueLevel[];
  recommendations: string[];
  nextWeekPreview: WorkoutDay[];
}

export interface PersonalRecord {
  exerciseId: string;
  exerciseName: string;
  weight: number;
  reps: number;
  achievedAt: string;
}

export interface PlanProgress {
  planId: string;
  totalWeeks: number;
  completedWeeks: number;
  overallCompletionPercent: number;
  weeklyCompletionPercents: number[];
  currentStreak: number;
  totalWorkoutsCompleted: number;
  totalWorkoutsPlanned: number;
}

export interface PlanAdjustment {
  planId: string;
  weekNumber: number;
  adjustments: AdjustmentAction[];
  reason: string;
}

export interface AdjustmentAction {
  type: 'add_exercise' | 'remove_exercise' | 'modify_sets' | 'modify_weight' | 'modify_reps' | 'add_rest_day';
  exerciseId?: string;
  dayOfWeek?: number;
  oldValue?: number;
  newValue?: number;
  description: string;
}

export interface ExerciseFilter {
  muscleGroups?: MuscleGroup[];
  equipment?: EquipmentCategory[];
  category?: ExerciseCategory;
  difficulty?: DifficultyLevel;
  ids?: string[];
  nameContains?: string;
}

export interface TemplateConfig {
  goal: FitnessGoal;
  daysPerWeek: number;
  difficulty: DifficultyLevel;
  name: string;
  description: string;
}

export type WeightedExercise = {
  exerciseId: string;
  priority: number;
};
