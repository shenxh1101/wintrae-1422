import {
  TrainingPlan,
  PlanProgress,
  WeeklyReport,
  PersonalRecord,
  MuscleGroup,
  FatigueLevel,
  WorkoutDay,
} from '../types';
import { ExerciseLibrary } from '../exercise';
import { RecordStore } from '../record';

export function calculateProgress(plan: TrainingPlan, store: RecordStore): PlanProgress {
  const completedWeeks = plan.weeks.filter((week) => {
    const rate = store.getCompletionRateForWeek(plan, week.weekNumber);
    return rate >= 80;
  }).length;

  const weeklyPercents = plan.weeks.map((week) =>
    store.getCompletionRateForWeek(plan, week.weekNumber),
  );

  const overallCompletion =
    weeklyPercents.length > 0
      ? Math.round(weeklyPercents.reduce((a, b) => a + b, 0) / weeklyPercents.length)
      : 0;

  let totalWorkoutsCompleted = 0;
  let totalWorkoutsPlanned = 0;
  let currentStreak = 0;
  let streakBroken = false;

  for (let i = plan.weeks.length - 1; i >= 0; i--) {
    const week = plan.weeks[i];
    for (const day of week.days) {
      if (day.isRestDay || day.exercises.length === 0) continue;
      totalWorkoutsPlanned++;
      const allCompleted = day.exercises.every((s) => s.completed);
      if (allCompleted) {
        totalWorkoutsCompleted++;
        if (!streakBroken) currentStreak++;
      } else {
        streakBroken = true;
      }
    }
  }

  return {
    planId: plan.id,
    totalWeeks: plan.totalWeeks,
    completedWeeks,
    overallCompletionPercent: overallCompletion,
    weeklyCompletionPercents: weeklyPercents,
    currentStreak,
    totalWorkoutsCompleted,
    totalWorkoutsPlanned,
  };
}

export function generateWeeklyReport(
  plan: TrainingPlan,
  weekNumber: number,
  store: RecordStore,
  library: ExerciseLibrary,
): WeeklyReport {
  const week = plan.weeks.find((w) => w.weekNumber === weekNumber);
  if (!week) {
    return emptyReport(plan.id, weekNumber);
  }

  const completionRate = store.getCompletionRateForWeek(plan, weekNumber);
  const feedback = store.getFeedback(plan.id, weekNumber);

  let totalVolume = 0;
  let totalSets = 0;
  let totalReps = 0;
  let weightSum = 0;
  let weightCount = 0;

  const muscleDistribution: Partial<Record<MuscleGroup, number>> = {};
  const personalRecords: PersonalRecord[] = [];

  for (const day of week.days) {
    if (day.isRestDay) continue;

    for (const set of day.exercises) {
      totalSets++;
      const reps = set.actualReps ?? set.targetReps;
      const weight = set.actualWeight ?? set.targetWeight;
      totalReps += reps;
      totalVolume += weight * reps;

      if (weight > 0) {
        weightSum += weight;
        weightCount++;
      }

      const ex = library.findById(set.exerciseId);
      if (ex) {
        for (const mg of ex.muscleGroups) {
          muscleDistribution[mg] = (muscleDistribution[mg] ?? 0) + reps;
        }
      }

      if (set.completed && (set.actualWeight ?? 0) > (set.targetWeight * 0.95)) {
        const exName = ex ? ex.name : set.exerciseId;
        personalRecords.push({
          exerciseId: set.exerciseId,
          exerciseName: exName,
          weight: set.actualWeight ?? set.targetWeight,
          reps: set.actualReps ?? set.targetReps,
          achievedAt: new Date().toISOString(),
        });
      }
    }
  }

  const fatigueTrend: FatigueLevel[] = [];
  for (let w = 1; w <= weekNumber; w++) {
    const fb = store.getFeedback(plan.id, w);
    if (fb) fatigueTrend.push(fb.overallFatigue);
  }

  const recommendations = generateRecommendations(completionRate, feedback?.overallFatigue, feedback?.sleepQuality, personalRecords.length);

  const nextWeek = plan.weeks.find((w) => w.weekNumber === weekNumber + 1);
  const nextWeekPreview: WorkoutDay[] = nextWeek
    ? nextWeek.days.filter((d) => !d.isRestDay)
    : [];

  return {
    planId: plan.id,
    weekNumber,
    completionRate,
    totalVolume: Math.round(totalVolume * 10) / 10,
    totalSets,
    totalReps,
    averageWeight: weightCount > 0 ? Math.round((weightSum / weightCount) * 10) / 10 : 0,
    personalRecords,
    muscleGroupDistribution: muscleDistribution,
    fatigueTrend,
    recommendations,
    nextWeekPreview,
  };
}

function generateRecommendations(
  completionRate: number,
  overallFatigue?: FatigueLevel,
  sleepQuality?: FatigueLevel,
  prCount?: number,
): string[] {
  const recs: string[] = [];

  if (completionRate < 50) {
    recs.push('本周完成率较低，建议降低训练频率或缩短单次训练时长');
  } else if (completionRate < 80) {
    recs.push('完成率一般，尝试优化训练时间安排');
  } else {
    recs.push('完成率优秀，保持当前节奏！');
  }

  if (overallFatigue !== undefined) {
    if (overallFatigue >= 8) {
      recs.push('疲劳度较高，建议下周安排减载训练');
    } else if (overallFatigue <= 3) {
      recs.push('身体恢复良好，可考虑适当增加训练量');
    }
  }

  if (sleepQuality !== undefined && sleepQuality <= 4) {
    recs.push('睡眠质量不足，优先保障睡眠再考虑加量');
  }

  if (prCount && prCount > 0) {
    recs.push(`本周达成${prCount}项个人记录，继续突破！`);
  }

  if (completionRate >= 80 && (overallFatigue ?? 5) <= 6) {
    recs.push('状态良好，可以尝试在主要复合动作上增加2-5%重量');
  }

  return recs;
}

function emptyReport(planId: string, weekNumber: number): WeeklyReport {
  return {
    planId,
    weekNumber,
    completionRate: 0,
    totalVolume: 0,
    totalSets: 0,
    totalReps: 0,
    averageWeight: 0,
    personalRecords: [],
    muscleGroupDistribution: {},
    fatigueTrend: [],
    recommendations: ['暂无数据，完成训练后即可生成报告'],
    nextWeekPreview: [],
  };
}
