import { FitnessTrainingSDK } from './index';
import {
  InvalidConfigError,
  ExerciseNotFoundError,
  DuplicateExerciseError,
  InsufficientDaysError,
  NoAvailableEquipmentError,
  PlanNotFoundError,
  SubstitutionError,
} from './errors';
import { Exercise, WorkoutDay, ExerciseSet, EquipmentCategory, SubstitutionResult, PlanGenerationResult, ExportedData, SubstitutionPreview } from './types';

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

    test('should filter replacements by available equipment', () => {
      const reps = sdk.getExerciseReplacements('barbell_squat', ['dumbbell', 'none']);
      for (const r of reps) {
        expect(r.equipment.some((eq) => eq === 'none' || eq === 'dumbbell')).toBe(true);
      }
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

    test('should include configSnapshot in generated plan', () => {
      const plan = sdk.generatePlan(baseConfig);
      expect(plan.configSnapshot).toBeDefined();
      expect(plan.configSnapshot.goal).toBe(baseConfig.goal);
      expect(plan.configSnapshot.availableDaysPerWeek).toBe(baseConfig.availableDaysPerWeek);
      expect(plan.configSnapshot.equipment).toEqual(baseConfig.equipment);
      expect(plan.configSnapshot.difficulty).toBe(baseConfig.difficulty);
      expect(plan.configSnapshot.unitSystem).toBe('metric');
    });
  });

  describe('Plan Generation with Diagnostics', () => {
    const baseConfig = {
      userId: 'user_diag',
      goal: 'strength' as const,
      availableDaysPerWeek: 3,
      equipment: ['barbell', 'bench', 'dumbbell'] as EquipmentCategory[],
      limitations: [] as any[],
      preferredExerciseIds: [] as string[],
      difficulty: 'intermediate' as const,
    };

    test('should return PlanGenerationResult with plan when equipment is sufficient', () => {
      const result = sdk.generatePlanWithDiagnostics(baseConfig);
      expect(result.plan).not.toBeNull();
      expect(result.canProceed).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.alternatives).toBeDefined();
      expect(result.unresolvableDays).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe('string');
    });

    test('should return canProceed=true and no warnings for well-equipped config', () => {
      const result = sdk.generatePlanWithDiagnostics(baseConfig);
      expect(result.canProceed).toBe(true);
    });

    test('should produce warnings when preferred exercise is unavailable', () => {
      const config = {
        ...baseConfig,
        equipment: ['none'] as EquipmentCategory[],
        goal: 'endurance' as const,
        preferredExerciseIds: ['barbell_squat', 'bench_press'],
      };
      const result = sdk.generatePlanWithDiagnostics(config);
      const prefWarnings = result.warnings.filter((w) => w.type === 'preferred_unavailable');
      expect(prefWarnings.length).toBeGreaterThan(0);
      for (const w of prefWarnings) {
        expect(w.exerciseId).toBeDefined();
        expect(w.message).toContain('偏好动作');
      }
    });

    test('should produce exercise_filtered warnings when equipment filters out exercises', () => {
      const config = {
        ...baseConfig,
        equipment: ['none'] as EquipmentCategory[],
        goal: 'endurance' as const,
      };
      const result = sdk.generatePlanWithDiagnostics(config);
      const filteredWarnings = result.warnings.filter((w) => w.type === 'exercise_filtered');
      expect(filteredWarnings.length).toBeGreaterThan(0);
      for (const w of filteredWarnings) {
        expect(w.suggestedEquipment).toBeDefined();
      }
    });

    test('should produce alternatives for filtered exercises', () => {
      const config = {
        ...baseConfig,
        equipment: ['none'] as EquipmentCategory[],
        goal: 'endurance' as const,
      };
      const result = sdk.generatePlanWithDiagnostics(config);
      if (result.alternatives.length > 0) {
        const alt = result.alternatives[0];
        expect(alt.originalExerciseId).toBeDefined();
        expect(alt.originalExerciseName).toBeDefined();
        expect(alt.reason).toBeDefined();
        expect(alt.alternatives.length).toBeGreaterThan(0);
      }
    });

    test('should return canProceed=false with unresolvableDays when no exercises available', () => {
      const config = {
        ...baseConfig,
        equipment: ['smith_machine'] as EquipmentCategory[],
      };
      const result = sdk.generatePlanWithDiagnostics(config);
      if (!result.canProceed) {
        expect(result.plan).toBeNull();
        expect(result.unresolvableDays.length).toBeGreaterThan(0);
        for (const day of result.unresolvableDays) {
          expect(day.dayIndex).toBeDefined();
          expect(day.label).toBeDefined();
          expect(day.targetMuscleGroups).toBeDefined();
          expect(day.reason).toBeDefined();
          expect(day.missingEquipment).toBeDefined();
          expect(day.conflictingLimitations).toBeDefined();
        }
      }
    });

    test('should include suggested equipment in summary when days are unresolvable', () => {
      const config = {
        ...baseConfig,
        equipment: ['smith_machine'] as EquipmentCategory[],
      };
      const result = sdk.generatePlanWithDiagnostics(config);
      if (!result.canProceed) {
        expect(result.summary).toContain('器械');
      }
    });

    test('should throw NoAvailableEquipmentError from generatePlan when all exercises are blocked', () => {
      const config = {
        ...baseConfig,
        equipment: ['resistance_band'] as EquipmentCategory[],
        limitations: [
          {
            area: '全身',
            severity: 'severe' as const,
            movementsToAvoid: [
              'bodyweight_squat', 'push_up', 'plank', 'dead_bug', 'bird_dog',
              'glute_bridge', 'nordic_curl', 'lunge', 'calf_raise',
            ],
          },
        ],
      };
      expect(() => sdk.generatePlan(config)).toThrow(NoAvailableEquipmentError);
    });

    test('should include remediationSuggestions in diagnostics result', () => {
      const config = {
        ...baseConfig,
        equipment: ['none'] as EquipmentCategory[],
        goal: 'endurance' as const,
      };
      const result = sdk.generatePlanWithDiagnostics(config);
      expect(result.remediationSuggestions).toBeDefined();
      expect(Array.isArray(result.remediationSuggestions)).toBe(true);
      if (result.remediationSuggestions.length > 0) {
        const sug = result.remediationSuggestions[0];
        expect(sug.type).toBeDefined();
        expect(sug.description).toBeDefined();
        expect(sug.impact).toBeDefined();
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
    const makePlanConfig = (userId: string) => ({
      userId,
      goal: 'strength' as const,
      availableDaysPerWeek: 3,
      equipment: ['barbell', 'bench'] as EquipmentCategory[],
      limitations: [] as any[],
      preferredExerciseIds: [] as string[],
      difficulty: 'intermediate' as const,
    });

    test('should calculate progress with planned and actual fields', () => {
      const plan = sdk.generatePlan(makePlanConfig('user_prog'));
      const progress = sdk.getProgress(plan.id);
      expect(progress.planId).toBe(plan.id);
      expect(progress.totalWeeks).toBe(8);
      expect(progress.overallCompletionPercent).toBe(0);
      expect(progress.planned).toBeDefined();
      expect(progress.actual).toBeDefined();
    });

    test('should have actual=0 when no records exist', () => {
      const plan = sdk.generatePlan(makePlanConfig('user_prog_empty'));
      const progress = sdk.getProgress(plan.id);
      expect(progress.actual.actualSets).toBe(0);
      expect(progress.actual.actualVolume).toBe(0);
      expect(progress.actual.actualReps).toBe(0);
      expect(progress.actual.actualWorkouts).toBe(0);
      expect(progress.actual.completionRate).toBe(0);
    });

    test('should have planned > 0 even without records', () => {
      const plan = sdk.generatePlan(makePlanConfig('user_prog_plan'));
      const progress = sdk.getProgress(plan.id);
      expect(progress.planned.plannedSets).toBeGreaterThan(0);
      expect(progress.planned.plannedWorkouts).toBeGreaterThan(0);
    });

    test('should reflect actual data after recording training', () => {
      const plan = sdk.generatePlan(makePlanConfig('user_prog_rec'));
      const week1 = plan.weeks[0];
      const trainingDay = week1.days.find((d: WorkoutDay) => !d.isRestDay && d.exercises.length > 0);
      if (!trainingDay) return;

      for (const set of trainingDay.exercises) {
        sdk.recordTraining({
          id: '',
          planId: plan.id,
          weekNumber: 1,
          dayOfWeek: trainingDay.dayOfWeek,
          exerciseId: set.exerciseId,
          setIndex: set.setIndex,
          actualReps: set.targetReps,
          actualWeight: set.targetWeight,
          completedAt: '',
          restTakenSeconds: 90,
        });
      }

      const progress = sdk.getProgress(plan.id);
      expect(progress.actual.actualSets).toBeGreaterThan(0);
      expect(progress.actual.actualVolume).toBeGreaterThan(0);
    });

    test('should generate weekly report with planned and actual', () => {
      const plan = sdk.generatePlan(makePlanConfig('user_rpt'));
      const report = sdk.getWeeklyReport(plan.id, 1);
      expect(report.planId).toBe(plan.id);
      expect(report.weekNumber).toBe(1);
      expect(report.planned).toBeDefined();
      expect(report.actual).toBeDefined();
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    test('should have actual all-zero in weekly report when no records', () => {
      const plan = sdk.generatePlan(makePlanConfig('user_rpt_empty'));
      const report = sdk.getWeeklyReport(plan.id, 1);
      expect(report.actual.actualSets).toBe(0);
      expect(report.actual.actualVolume).toBe(0);
      expect(report.actual.actualReps).toBe(0);
      expect(report.actual.actualWorkouts).toBe(0);
    });

    test('should have planned > 0 in weekly report', () => {
      const plan = sdk.generatePlan(makePlanConfig('user_rpt_plan'));
      const report = sdk.getWeeklyReport(plan.id, 1);
      expect(report.planned.plannedSets).toBeGreaterThan(0);
      expect(report.planned.plannedWorkouts).toBeGreaterThan(0);
    });

    test('should reflect actual data in weekly report after recording', () => {
      const plan = sdk.generatePlan(makePlanConfig('user_rpt_rec'));
      const week1 = plan.weeks[0];
      const trainingDay = week1.days.find((d: WorkoutDay) => !d.isRestDay && d.exercises.length > 0);
      if (!trainingDay) return;

      const firstSet = trainingDay.exercises[0];
      sdk.recordTraining({
        id: '',
        planId: plan.id,
        weekNumber: 1,
        dayOfWeek: trainingDay.dayOfWeek,
        exerciseId: firstSet.exerciseId,
        setIndex: firstSet.setIndex,
        actualReps: firstSet.targetReps,
        actualWeight: firstSet.targetWeight,
        completedAt: '',
        restTakenSeconds: 90,
      });

      const report = sdk.getWeeklyReport(plan.id, 1);
      expect(report.actual.actualSets).toBeGreaterThan(0);
      expect(report.actual.actualVolume).toBeGreaterThan(0);
      expect(report.completionRate).toBeGreaterThan(0);
    });

    test('should include fatigue trend in weekly report', () => {
      const plan = sdk.generatePlan(makePlanConfig('user_rpt_fatigue'));
      sdk.submitFatigueFeedback({
        planId: plan.id,
        weekNumber: 1,
        overallFatigue: 7,
        sleepQuality: 6,
        motivationLevel: 5,
      });
      const report = sdk.getWeeklyReport(plan.id, 1);
      expect(report.fatigueTrend).toBeDefined();
      expect(report.fatigueTrend.length).toBeGreaterThan(0);
      expect(report.fatigueTrend).toContain(7);
    });

    test('should include personal records only from actual completed sets', () => {
      const plan = sdk.generatePlan(makePlanConfig('user_rpt_pr'));
      const report = sdk.getWeeklyReport(plan.id, 1);
      expect(report.personalRecords).toEqual([]);
    });

    test('should generate empty report for non-existent week', () => {
      const plan = sdk.generatePlan(makePlanConfig('user_rpt_empty_w'));
      const report = sdk.getWeeklyReport(plan.id, 999);
      expect(report.planned.plannedSets).toBe(0);
      expect(report.actual.actualSets).toBe(0);
      expect(report.completionRate).toBe(0);
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
    const makeConfig = (userId: string) => ({
      userId,
      goal: 'strength' as const,
      availableDaysPerWeek: 3,
      equipment: ['barbell', 'bench', 'dumbbell'] as EquipmentCategory[],
      limitations: [] as any[],
      preferredExerciseIds: [] as string[],
      difficulty: 'intermediate' as const,
    });

    test('should preview substitution with impact and validation', () => {
      const plan = sdk.generatePlan(makeConfig('user_sub_pre'));
      const week1 = plan.weeks[0];
      const trainingDay = week1.days.find((d: WorkoutDay) => !d.isRestDay && d.exercises.length > 0);
      if (!trainingDay) return;

      const firstExerciseId = trainingDay.exercises[0].exerciseId;
      const exercise = sdk.findExercise(firstExerciseId);
      if (!exercise || exercise.replacementIds.length === 0) return;

      const replacementId = exercise.replacementIds[0];
      const preview = sdk.previewSubstitution(
        plan.id,
        1,
        trainingDay.dayOfWeek,
        firstExerciseId,
        replacementId,
      );

      expect(preview.targetExerciseId).toBe(firstExerciseId);
      expect(preview.replacementExerciseId).toBe(replacementId);
      expect(preview.isValid).toBe(true);
      expect(preview.validationErrors.length).toBe(0);
      expect(preview.impact).toBeDefined();
      expect(Array.isArray(preview.risks)).toBe(true);
      expect(Array.isArray(preview.benefits)).toBe(true);
    });

    test('should return isValid=false for substitution with unavailable equipment', () => {
      const plan = sdk.generatePlan(makeConfig('user_sub_inv_eq'));
      const week1 = plan.weeks[0];
      const trainingDay = week1.days.find((d: WorkoutDay) => !d.isRestDay && d.exercises.length > 0);
      if (!trainingDay) return;

      const firstExerciseId = trainingDay.exercises[0].exerciseId;
      const preview = sdk.previewSubstitution(
        plan.id,
        1,
        trainingDay.dayOfWeek,
        firstExerciseId,
        'kettlebell_swing',
      );

      expect(preview.isValid).toBe(false);
      expect(preview.validationErrors.length).toBeGreaterThan(0);
    });

    test('should throw SubstitutionError when substituting invalid replacement', () => {
      const plan = sdk.generatePlan(makeConfig('user_sub_throw'));
      const week1 = plan.weeks[0];
      const trainingDay = week1.days.find((d: WorkoutDay) => !d.isRestDay && d.exercises.length > 0);
      if (!trainingDay) return;

      const firstExerciseId = trainingDay.exercises[0].exerciseId;
      expect(() =>
        sdk.substituteExercise(plan.id, 1, trainingDay.dayOfWeek, firstExerciseId, 'kettlebell_swing'),
      ).toThrow(SubstitutionError);
    });

    test('should substitute exercise and return SubstitutionResult', () => {
      const plan = sdk.generatePlan(makeConfig('user_sub'));
      const week1 = plan.weeks[0];
      const trainingDay = week1.days.find((d: WorkoutDay) => !d.isRestDay && d.exercises.length > 0);
      if (!trainingDay) return;

      const firstExerciseId = trainingDay.exercises[0].exerciseId;
      const exercise = sdk.findExercise(firstExerciseId);
      if (!exercise || exercise.replacementIds.length === 0) return;

      const replacementId = exercise.replacementIds[0];
      const result = sdk.substituteExercise(
        plan.id,
        1,
        trainingDay.dayOfWeek,
        firstExerciseId,
        replacementId,
      );

      expect(result.plan).toBeDefined();
      expect(result.replaced).toBeDefined();
      expect(result.replaced.targetExerciseId).toBe(firstExerciseId);
      expect(result.replaced.replacementExerciseId).toBe(replacementId);
      expect(result.replaced.targetExerciseName).toBeDefined();
      expect(result.replaced.replacementExerciseName).toBeDefined();
    });

    test('should track impact scope in substitution result', () => {
      const plan = sdk.generatePlan(makeConfig('user_sub_impact'));
      const week1 = plan.weeks[0];
      const trainingDay = week1.days.find((d: WorkoutDay) => !d.isRestDay && d.exercises.length > 0);
      if (!trainingDay) return;

      const firstExerciseId = trainingDay.exercises[0].exerciseId;
      const exercise = sdk.findExercise(firstExerciseId);
      if (!exercise || exercise.replacementIds.length === 0) return;

      const replacementId = exercise.replacementIds[0];
      const result = sdk.substituteExercise(
        plan.id,
        1,
        trainingDay.dayOfWeek,
        firstExerciseId,
        replacementId,
      );

      expect(result.impact).toBeDefined();
      expect(Array.isArray(result.impact)).toBe(true);
      if (result.impact.length > 0) {
        const imp = result.impact[0];
        expect(imp.weekNumber).toBe(1);
        expect(imp.dayOfWeek).toBe(trainingDay.dayOfWeek);
        expect(imp.dayLabel).toBeDefined();
        expect(imp.setIndices.length).toBeGreaterThan(0);
      }
    });

    test('should list available replacements in substitution result', () => {
      const plan = sdk.generatePlan(makeConfig('user_sub_avail'));
      const week1 = plan.weeks[0];
      const trainingDay = week1.days.find((d: WorkoutDay) => !d.isRestDay && d.exercises.length > 0);
      if (!trainingDay) return;

      const firstExerciseId = trainingDay.exercises[0].exerciseId;
      const exercise = sdk.findExercise(firstExerciseId);
      if (!exercise || exercise.replacementIds.length === 0) return;

      const replacementId = exercise.replacementIds[0];
      const result = sdk.substituteExercise(
        plan.id,
        1,
        trainingDay.dayOfWeek,
        firstExerciseId,
        replacementId,
      );

      expect(result.availableReplacements).toBeDefined();
      expect(Array.isArray(result.availableReplacements)).toBe(true);
    });

    test('should actually replace exercise in the plan', () => {
      const plan = sdk.generatePlan(makeConfig('user_sub_replace'));
      const week1 = plan.weeks[0];
      const trainingDay = week1.days.find((d: WorkoutDay) => !d.isRestDay && d.exercises.length > 0);
      if (!trainingDay) return;

      const firstExerciseId = trainingDay.exercises[0].exerciseId;
      const exercise = sdk.findExercise(firstExerciseId);
      if (!exercise || exercise.replacementIds.length === 0) return;

      const replacementId = exercise.replacementIds[0];
      const result = sdk.substituteExercise(
        plan.id,
        1,
        trainingDay.dayOfWeek,
        firstExerciseId,
        replacementId,
      );

      const updatedDay = result.plan.weeks[0].days.find(
        (d: WorkoutDay) => d.dayOfWeek === trainingDay.dayOfWeek,
      );
      expect(updatedDay!.exercises.some((s: ExerciseSet) => s.exerciseId === replacementId)).toBe(true);
    });
  });

  describe('Plan Versioning', () => {
    const makeConfig = (userId: string) => ({
      userId,
      goal: 'strength' as const,
      availableDaysPerWeek: 3,
      equipment: ['barbell', 'bench', 'dumbbell'] as EquipmentCategory[],
      limitations: [] as any[],
      preferredExerciseIds: [] as string[],
      difficulty: 'intermediate' as const,
    });

    test('should start with version 0 for new plan', () => {
      const plan = sdk.generatePlan(makeConfig('user_ver_0'));
      expect(sdk.getCurrentVersion(plan.id)).toBe(0);
      expect(sdk.getPlanVersions(plan.id)).toEqual([]);
    });

    test('should increment version on substitution', () => {
      const plan = sdk.generatePlan(makeConfig('user_ver_sub'));
      const week1 = plan.weeks[0];
      const trainingDay = week1.days.find((d: WorkoutDay) => !d.isRestDay && d.exercises.length > 0);
      if (!trainingDay) return;

      const firstExerciseId = trainingDay.exercises[0].exerciseId;
      const exercise = sdk.findExercise(firstExerciseId);
      if (!exercise || exercise.replacementIds.length === 0) return;

      sdk.substituteExercise(plan.id, 1, trainingDay.dayOfWeek, firstExerciseId, exercise.replacementIds[0]);
      expect(sdk.getCurrentVersion(plan.id)).toBe(1);
      const versions = sdk.getPlanVersions(plan.id);
      expect(versions.length).toBe(1);
      expect(versions[0].version).toBe(1);
      expect(versions[0].reason).toContain('替换动作');
    });

    test('should increment version on unit conversion', () => {
      const plan = sdk.generatePlan(makeConfig('user_ver_unit'));
      sdk.convertPlanUnits(plan.id, 'imperial');
      expect(sdk.getCurrentVersion(plan.id)).toBe(1);
      const versions = sdk.getPlanVersions(plan.id);
      expect(versions[0].reason).toContain('单位');
    });

    test('should increment version on plan adjustment', () => {
      const plan = sdk.generatePlan(makeConfig('user_ver_adj'));
      sdk.submitFatigueFeedback({
        planId: plan.id,
        weekNumber: 1,
        overallFatigue: 9,
        sleepQuality: 3,
        motivationLevel: 4,
      });
      sdk.adjustPlan(plan.id, 1);
      const versions = sdk.getPlanVersions(plan.id);
      expect(versions.some((v) => v.reason.includes('疲劳反馈'))).toBe(true);
    });

    test('should rollback to previous version', () => {
      const plan = sdk.generatePlan(makeConfig('user_ver_rb'));
      const originalGoal = plan.goal;

      sdk.convertPlanUnits(plan.id, 'imperial');
      expect(sdk.getCurrentVersion(plan.id)).toBe(1);

      const rolledBack = sdk.rollbackToVersion(plan.id, 1);
      expect(rolledBack).toBeDefined();
      expect(rolledBack.goal).toBe(originalGoal);
    });

    test('should throw when rolling back to non-existent version', () => {
      const plan = sdk.generatePlan(makeConfig('user_ver_bad'));
      expect(() => sdk.rollbackToVersion(plan.id, 99)).toThrow();
    });

    test('should preserve version snapshot with full plan copy', () => {
      const plan = sdk.generatePlan(makeConfig('user_ver_snap'));
      sdk.convertPlanUnits(plan.id, 'imperial');
      const versions = sdk.getPlanVersions(plan.id);
      expect(versions[0].plan).toBeDefined();
      expect(versions[0].plan.id).toBe(plan.id);
      expect(versions[0].timestamp).toBeDefined();
    });
  });

  describe('Import / Export', () => {
    const makeConfig = (userId: string) => ({
      userId,
      goal: 'strength' as const,
      availableDaysPerWeek: 3,
      equipment: ['barbell', 'bench', 'dumbbell'] as EquipmentCategory[],
      limitations: [] as any[],
      preferredExerciseIds: [] as string[],
      difficulty: 'intermediate' as const,
    });

    test('should export plan data with all required fields', () => {
      const plan = sdk.generatePlan(makeConfig('user_exp'));
      const exported = sdk.exportData(plan.id);

      expect(exported.plan).toBeDefined();
      expect(exported.plan.id).toBe(plan.id);
      expect(exported.records).toBeDefined();
      expect(exported.feedbacks).toBeDefined();
      expect(exported.versions).toBeDefined();
      expect(exported.exportedAt).toBeDefined();
      expect(exported.sdkVersion).toBeDefined();
    });

    test('should export records and feedbacks', () => {
      const plan = sdk.generatePlan(makeConfig('user_exp_rec'));
      sdk.recordTraining({
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
      sdk.submitFatigueFeedback({
        planId: plan.id,
        weekNumber: 1,
        overallFatigue: 6,
        sleepQuality: 7,
        motivationLevel: 8,
      });

      const exported = sdk.exportData(plan.id);
      expect(exported.records.length).toBeGreaterThan(0);
      expect(exported.feedbacks.length).toBeGreaterThan(0);
    });

    test('should export version history', () => {
      const plan = sdk.generatePlan(makeConfig('user_exp_ver'));
      sdk.convertPlanUnits(plan.id, 'imperial');
      const exported = sdk.exportData(plan.id);
      expect(exported.versions.length).toBeGreaterThan(0);
    });

    test('should import data and restore plan state', () => {
      const plan = sdk.generatePlan(makeConfig('user_imp'));
      sdk.recordTraining({
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
      sdk.submitFatigueFeedback({
        planId: plan.id,
        weekNumber: 1,
        overallFatigue: 6,
        sleepQuality: 7,
        motivationLevel: 8,
      });
      sdk.convertPlanUnits(plan.id, 'imperial');

      const exported = sdk.exportData(plan.id);
      const json = JSON.stringify(exported);

      const newSdk = new FitnessTrainingSDK();
      const imported = JSON.parse(json) as ExportedData;
      newSdk.importData(imported);

      const restoredPlan = newSdk.getPlan(exported.plan.id);
      expect(restoredPlan).toBeDefined();
      expect(restoredPlan.id).toBe(plan.id);
    });

    test('should continue calculating progress after import', () => {
      const plan = sdk.generatePlan(makeConfig('user_imp_prog'));
      sdk.recordTraining({
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

      const exported = sdk.exportData(plan.id);
      const json = JSON.stringify(exported);

      const newSdk = new FitnessTrainingSDK();
      newSdk.importData(JSON.parse(json));

      const progress = newSdk.getProgress(exported.plan.id);
      expect(progress).toBeDefined();
      expect(progress.planId).toBe(exported.plan.id);
    });

    test('should generate weekly report after import', () => {
      const plan = sdk.generatePlan(makeConfig('user_imp_rpt'));
      sdk.submitFatigueFeedback({
        planId: plan.id,
        weekNumber: 1,
        overallFatigue: 7,
        sleepQuality: 6,
        motivationLevel: 5,
      });

      const exported = sdk.exportData(plan.id);
      const json = JSON.stringify(exported);

      const newSdk = new FitnessTrainingSDK();
      newSdk.importData(JSON.parse(json));

      const report = newSdk.getWeeklyReport(exported.plan.id, 1);
      expect(report).toBeDefined();
      expect(report.fatigueTrend.length).toBeGreaterThan(0);
    });

    test('should throw PlanNotFoundError when exporting non-existent plan', () => {
      expect(() => sdk.exportData('nonexistent_plan')).toThrow(PlanNotFoundError);
    });

    test('should preserve version history and continue version numbering after import', () => {
      const plan = sdk.generatePlan(makeConfig('user_imp_ver'));
      sdk.convertPlanUnits(plan.id, 'imperial');
      expect(sdk.getCurrentVersion(plan.id)).toBe(1);
      expect(sdk.getPlanVersions(plan.id).length).toBe(1);

      sdk.convertPlanUnits(plan.id, 'metric');
      expect(sdk.getCurrentVersion(plan.id)).toBe(2);
      expect(sdk.getPlanVersions(plan.id).length).toBe(2);

      const exported = sdk.exportData(plan.id);
      const json = JSON.stringify(exported);

      const newSdk = new FitnessTrainingSDK();
      newSdk.importData(JSON.parse(json));

      expect(newSdk.getCurrentVersion(exported.plan.id)).toBe(2);
      expect(newSdk.getPlanVersions(exported.plan.id).length).toBe(2);

      newSdk.convertPlanUnits(exported.plan.id, 'imperial');
      expect(newSdk.getCurrentVersion(exported.plan.id)).toBe(3);
      expect(newSdk.getPlanVersions(exported.plan.id).length).toBe(3);
    });

    test('should rollback correctly after import', () => {
      const plan = sdk.generatePlan(makeConfig('user_imp_rb'));
      sdk.convertPlanUnits(plan.id, 'imperial');

      const exported = sdk.exportData(plan.id);
      const json = JSON.stringify(exported);

      const newSdk = new FitnessTrainingSDK();
      newSdk.importData(JSON.parse(json));

      const rolledBack = newSdk.rollbackToVersion(exported.plan.id, 1);
      expect(rolledBack).toBeDefined();
      expect(newSdk.getCurrentVersion(exported.plan.id)).toBe(2);
    });
  });
});
