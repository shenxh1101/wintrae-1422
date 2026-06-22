import { FitnessTrainingSDK } from './index';
import {
  InvalidConfigError,
  ExerciseNotFoundError,
  DuplicateExerciseError,
  InsufficientDaysError,
} from './errors';
import { Exercise, WorkoutDay, ExerciseSet, EquipmentCategory } from './types';

describe('FitnessTrainingSDK', () => {
  let sdk: FitnessTrainingSDK;

  beforeEach(() => {
    sdk = new FitnessTrainingSDK();
  });

  describe('Exercise Library', () => {
    test('should have default exercises loaded', () => {
      expect(sdk.getExerciseCount()).toBeGreaterThan(0);
    });

    test('should query exercises by muscle group', () => {
      const chestExercises = sdk.queryExercises({ muscleGroups: ['chest'] });
      expect(chestExercises.length).toBeGreaterThan(0);
      expect(chestExercises.every((e: Exercise) => e.muscleGroups.includes('chest'))).toBe(true);
    });

    test('should query exercises by equipment', () => {
      const bwExercises = sdk.queryExercises({ equipment: ['none'] });
      expect(bwExercises.length).toBeGreaterThan(0);
    });

    test('should query exercises by name', () => {
      const results = sdk.queryExercises({ nameContains: '深蹲' });
      expect(results.length).toBeGreaterThan(0);
    });

    test('should get exercise by id', () => {
      const ex = sdk.getExercise('barbell_squat');
      expect(ex.id).toBe('barbell_squat');
      expect(ex.name).toBe('杠铃深蹲');
    });

    test('should throw ExerciseNotFoundError for invalid id', () => {
      expect(() => sdk.getExercise('nonexistent')).toThrow(ExerciseNotFoundError);
    });

    test('should register custom exercise', () => {
      const customExercise: Exercise = {
        id: 'custom_banded_squat',
        name: '弹力带深蹲',
        nameEn: 'Banded Squat',
        category: 'compound',
        muscleGroups: ['quads', 'glutes'],
        equipment: ['resistance_band'],
        difficulty: 'beginner',
        instructions: ['将弹力带套在大腿上', '执行深蹲动作'],
        replacementIds: ['bodyweight_squat'],
        isCustom: true,
      };

      sdk.registerExercise(customExercise);
      const found = sdk.findExercise('custom_banded_squat');
      expect(found).toBeDefined();
      expect(found!.name).toBe('弹力带深蹲');
      expect(sdk.getCustomExerciseCount()).toBe(1);
    });

    test('should throw DuplicateExerciseError for non-custom duplicates', () => {
      const dupe: Exercise = {
        id: 'barbell_squat',
        name: '杠铃深蹲',
        nameEn: 'Barbell Squat',
        category: 'compound',
        muscleGroups: ['quads'],
        equipment: ['barbell'],
        difficulty: 'intermediate',
        instructions: [],
        replacementIds: [],
        isCustom: false,
      };
      expect(() => sdk.registerExercise(dupe)).toThrow(DuplicateExerciseError);
    });

    test('should override custom exercise with same id', () => {
      const custom: Exercise = {
        id: 'custom_move',
        name: '自定义动作',
        nameEn: 'Custom Move',
        category: 'isolation',
        muscleGroups: ['biceps'],
        equipment: ['dumbbell'],
        difficulty: 'beginner',
        instructions: [],
        replacementIds: [],
        isCustom: true,
      };
      sdk.registerExercise(custom);
      expect(sdk.findExercise('custom_move')!.name).toBe('自定义动作');

      const updated: Exercise = { ...custom, name: '更新动作', nameEn: 'Updated Move' };
      sdk.registerExercise(updated);
      expect(sdk.findExercise('custom_move')!.name).toBe('更新动作');
    });

    test('should remove custom exercise', () => {
      const custom: Exercise = {
        id: 'temp_custom',
        name: '临时动作',
        nameEn: 'Temp',
        category: 'isolation',
        muscleGroups: ['biceps'],
        equipment: ['none'],
        difficulty: 'beginner',
        instructions: [],
        replacementIds: [],
        isCustom: true,
      };
      sdk.registerExercise(custom);
      expect(sdk.findExercise('temp_custom')).toBeDefined();
      expect(sdk.removeCustomExercise('temp_custom')).toBe(true);
      expect(sdk.findExercise('temp_custom')).toBeUndefined();
    });

    test('should not remove built-in exercise', () => {
      expect(sdk.removeCustomExercise('barbell_squat')).toBe(false);
    });

    test('should get replacements for exercise', () => {
      const reps = sdk.getExerciseReplacements('barbell_squat');
      expect(reps.length).toBeGreaterThan(0);
      expect(reps.some((r: Exercise) => r.id === 'goblet_squat')).toBe(true);
    });
  });

  describe('Plan Generation', () => {
    const baseConfig = {
      userId: 'user_001',
      goal: 'strength' as const,
      availableDaysPerWeek: 3,
      equipment: ['barbell', 'bench', 'dumbbell'] as EquipmentCategory[],
      limitations: [] as any[],
      preferredExerciseIds: [] as string[],
      difficulty: 'intermediate' as const,
    };

    test('should generate a training plan', () => {
      const plan = sdk.generatePlan(baseConfig);
      expect(plan.id).toBeDefined();
      expect(plan.userId).toBe('user_001');
      expect(plan.goal).toBe('strength');
      expect(plan.weeks.length).toBe(8);
    });

    test('should generate plan with custom total weeks', () => {
      const plan = sdk.generatePlan(baseConfig, 4);
      expect(plan.totalWeeks).toBe(4);
      expect(plan.weeks.length).toBe(4);
    });

    test('should split training across available days', () => {
      const plan = sdk.generatePlan(baseConfig);
      const week1 = plan.weeks[0];
      const trainingDays = week1.days.filter((d: WorkoutDay) => !d.isRestDay);
      const restDays = week1.days.filter((d: WorkoutDay) => d.isRestDay);
      expect(trainingDays.length).toBe(3);
      expect(restDays.length).toBe(4);
    });

    test('should include exercises in training days', () => {
      const plan = sdk.generatePlan(baseConfig);
      const trainingDays = plan.weeks[0].days.filter((d: WorkoutDay) => !d.isRestDay);
      for (const day of trainingDays) {
        expect(day.exercises.length).toBeGreaterThan(0);
      }
    });

    test('should include warmup suggestions', () => {
      const plan = sdk.generatePlan(baseConfig);
      const trainingDays = plan.weeks[0].days.filter((d: WorkoutDay) => !d.isRestDay);
      for (const day of trainingDays) {
        expect(day.warmup.length).toBeGreaterThan(0);
      }
    });

    test('should respect equipment constraints', () => {
      const bwConfig = {
        ...baseConfig,
        goal: 'endurance' as const,
        equipment: ['none'] as EquipmentCategory[],
      };
      const plan = sdk.generatePlan(bwConfig);
      const allExercises = plan.weeks[0].days.flatMap((d: WorkoutDay) => d.exercises);
      for (const set of allExercises) {
        const ex = sdk.findExercise(set.exerciseId);
        if (ex) {
          expect(ex.equipment.some((eq: string) => eq === 'none')).toBe(true);
        }
      }
    });

    test('should respect body limitations', () => {
      const config = {
        ...baseConfig,
        limitations: [{ area: '下背', severity: 'moderate' as const, movementsToAvoid: ['deadlift', 'barbell_squat'] }],
      };
      const plan = sdk.generatePlan(config);
      const allExercises = plan.weeks[0].days.flatMap((d: WorkoutDay) => d.exercises);
      const exerciseIds = new Set(allExercises.map((s: ExerciseSet) => s.exerciseId));
      expect(exerciseIds.has('deadlift')).toBe(false);
    });

    test('should throw InvalidConfigError for missing userId', () => {
      const badConfig = { ...baseConfig, userId: '' };
      expect(() => sdk.generatePlan(badConfig)).toThrow(InvalidConfigError);
    });

    test('should throw InsufficientDaysError for too few days', () => {
      const badConfig = { ...baseConfig, availableDaysPerWeek: 1 };
      expect(() => sdk.generatePlan(badConfig)).toThrow(InsufficientDaysError);
    });

    test('should throw InvalidConfigError for no equipment', () => {
      const badConfig = { ...baseConfig, equipment: [] as EquipmentCategory[] };
      expect(() => sdk.generatePlan(badConfig)).toThrow(InvalidConfigError);
    });

    test('should generate different goals correctly', () => {
      const goals = ['muscle_gain', 'fat_loss', 'endurance', 'general_fitness'] as const;
      for (const goal of goals) {
        const config = { ...baseConfig, goal };
        const plan = sdk.generatePlan(config);
        expect(plan.goal).toBe(goal);
        expect(plan.weeks.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Unit Conversion', () => {
    test('should convert kg to lb', () => {
      const lb = sdk.convertWeight(100, 'metric', 'imperial');
      expect(lb).toBeGreaterThan(220);
      expect(lb).toBeLessThan(221);
    });

    test('should convert lb to kg', () => {
      const kg = sdk.convertWeight(220, 'imperial', 'metric');
      expect(kg).toBeGreaterThan(99);
      expect(kg).toBeLessThan(101);
    });

    test('should return same value for same unit', () => {
      expect(sdk.convertWeight(100, 'metric', 'metric')).toBe(100);
    });

    test('should format weight correctly', () => {
      expect(sdk.formatWeight(100, 'metric')).toBe('100 kg');
      expect(sdk.formatWeight(220, 'imperial')).toBe('220 lb');
    });

    test('should convert plan units', () => {
      const config = {
        userId: 'user_unit',
        goal: 'strength' as const,
        availableDaysPerWeek: 3,
        equipment: ['barbell', 'bench'] as EquipmentCategory[],
        limitations: [] as any[],
        preferredExerciseIds: [] as string[],
        difficulty: 'intermediate' as const,
      };
      const plan = sdk.generatePlan(config);
      expect(plan.unitSystem).toBe('metric');

      const converted = sdk.convertPlanUnits(plan.id, 'imperial');
      expect(converted.unitSystem).toBe('imperial');
    });
  });

  describe('Training Records', () => {
    test('should record training completion', () => {
      const config = {
        userId: 'user_rec',
        goal: 'strength' as const,
        availableDaysPerWeek: 3,
        equipment: ['barbell', 'bench'] as EquipmentCategory[],
        limitations: [] as any[],
        preferredExerciseIds: [] as string[],
        difficulty: 'intermediate' as const,
      };
      const plan = sdk.generatePlan(config);

      const record = sdk.recordTraining({
        id: '',
        planId: plan.id,
        weekNumber: 1,
        dayOfWeek: 1,
        exerciseId: 'bench_press',
        setIndex: 1,
        actualReps: 5,
        actualWeight: 60,
        completedAt: '',
        restTakenSeconds: 120,
      });

      expect(record.id).toBeDefined();
      expect(record.completedAt).toBeDefined();
    });

    test('should submit fatigue feedback', () => {
      const config = {
        userId: 'user_fb',
        goal: 'strength' as const,
        availableDaysPerWeek: 3,
        equipment: ['barbell', 'bench'] as EquipmentCategory[],
        limitations: [] as any[],
        preferredExerciseIds: [] as string[],
        difficulty: 'intermediate' as const,
      };
      const plan = sdk.generatePlan(config);

      const feedback = sdk.submitFatigueFeedback({
        planId: plan.id,
        weekNumber: 1,
        overallFatigue: 6,
        muscleFatigue: { chest: 5, back: 7 },
        sleepQuality: 7,
        motivationLevel: 8,
      });

      expect(feedback.submittedAt).toBeDefined();
    });

    test('should reject invalid fatigue feedback', () => {
      const config = {
        userId: 'user_fb2',
        goal: 'strength' as const,
        availableDaysPerWeek: 3,
        equipment: ['barbell', 'bench'] as EquipmentCategory[],
        limitations: [] as any[],
        preferredExerciseIds: [] as string[],
        difficulty: 'intermediate' as const,
      };
      const plan = sdk.generatePlan(config);

      expect(() =>
        sdk.submitFatigueFeedback({
          planId: plan.id,
          weekNumber: 1,
          overallFatigue: 11 as any,
          sleepQuality: 5,
          motivationLevel: 5,
        }),
      ).toThrow();
    });
  });

  describe('Plan Adjustment', () => {
    test('should adjust plan based on high fatigue', () => {
      const config = {
        userId: 'user_adj',
        goal: 'strength' as const,
        availableDaysPerWeek: 3,
        equipment: ['barbell', 'bench'] as EquipmentCategory[],
        limitations: [] as any[],
        preferredExerciseIds: [] as string[],
        difficulty: 'intermediate' as const,
      };
      const plan = sdk.generatePlan(config);

      sdk.submitFatigueFeedback({
        planId: plan.id,
        weekNumber: 1,
        overallFatigue: 9,
        muscleFatigue: { back: 9 },
        sleepQuality: 3,
        motivationLevel: 4,
      });

      const result = sdk.adjustPlan(plan.id, 1);
      expect(result.adjustment.adjustments.length).toBeGreaterThan(0);
    });

    test('should not adjust when fatigue is moderate', () => {
      const config = {
        userId: 'user_adj2',
        goal: 'strength' as const,
        availableDaysPerWeek: 3,
        equipment: ['barbell', 'bench'] as EquipmentCategory[],
        limitations: [] as any[],
        preferredExerciseIds: [] as string[],
        difficulty: 'intermediate' as const,
      };
      const plan = sdk.generatePlan(config);

      sdk.submitFatigueFeedback({
        planId: plan.id,
        weekNumber: 1,
        overallFatigue: 5,
        sleepQuality: 6,
        motivationLevel: 7,
      });

      const result = sdk.adjustPlan(plan.id, 1);
      expect(result.adjustment.reason).toContain('正常');
    });
  });

  describe('Progress and Reports', () => {
    test('should calculate progress', () => {
      const config = {
        userId: 'user_prog',
        goal: 'strength' as const,
        availableDaysPerWeek: 3,
        equipment: ['barbell', 'bench'] as EquipmentCategory[],
        limitations: [] as any[],
        preferredExerciseIds: [] as string[],
        difficulty: 'intermediate' as const,
      };
      const plan = sdk.generatePlan(config);

      const progress = sdk.getProgress(plan.id);
      expect(progress.planId).toBe(plan.id);
      expect(progress.totalWeeks).toBe(8);
      expect(progress.overallCompletionPercent).toBe(0);
    });

    test('should generate weekly report', () => {
      const config = {
        userId: 'user_rpt',
        goal: 'strength' as const,
        availableDaysPerWeek: 3,
        equipment: ['barbell', 'bench'] as EquipmentCategory[],
        limitations: [] as any[],
        preferredExerciseIds: [] as string[],
        difficulty: 'intermediate' as const,
      };
      const plan = sdk.generatePlan(config);

      const report = sdk.getWeeklyReport(plan.id, 1);
      expect(report.planId).toBe(plan.id);
      expect(report.weekNumber).toBe(1);
      expect(report.totalSets).toBeGreaterThanOrEqual(0);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Templates', () => {
    test('should provide default template config', () => {
      const template = sdk.getDefaultTemplate('strength', 3, 'intermediate');
      expect(template.goal).toBe('strength');
      expect(template.daysPerWeek).toBe(3);
      expect(template.name).toContain('力量提升');
    });
  });

  describe('Exercise Substitution in Plan', () => {
    test('should substitute exercise in a plan', () => {
      const config = {
        userId: 'user_sub',
        goal: 'strength' as const,
        availableDaysPerWeek: 3,
        equipment: ['barbell', 'bench', 'dumbbell'] as EquipmentCategory[],
        limitations: [] as any[],
        preferredExerciseIds: [] as string[],
        difficulty: 'intermediate' as const,
      };
      const plan = sdk.generatePlan(config);

      const week1 = plan.weeks[0];
      const trainingDay = week1.days.find((d: WorkoutDay) => !d.isRestDay && d.exercises.length > 0);
      if (!trainingDay) return;

      const firstExerciseId = trainingDay.exercises[0].exerciseId;
      const exercise = sdk.findExercise(firstExerciseId);
      if (!exercise || exercise.replacementIds.length === 0) return;

      const replacementId = exercise.replacementIds[0];
      const updated = sdk.substituteExercise(
        plan.id,
        1,
        trainingDay.dayOfWeek,
        firstExerciseId,
        replacementId,
      );

      const updatedDay = updated.weeks[0].days.find((d: WorkoutDay) => d.dayOfWeek === trainingDay.dayOfWeek);
      expect(updatedDay!.exercises.some((s: ExerciseSet) => s.exerciseId === replacementId)).toBe(true);
    });
  });
});
