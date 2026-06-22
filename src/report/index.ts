import {
  TrainingPlan,
  TrainingWeek,
  PlanProgress,
  WeeklyReport,
  PersonalRecord,
  MuscleGroup,
  FatigueLevel,
  WorkoutDay,
  PlannedVsActual,
} from '../types';
import { ExerciseLibrary } from '../exercise';
import { RecordStore } from '../record';

function computePlannedVsActualForWeek(
  plan: TrainingPlan,
  weekNumber: number,
  hasRecords: boolean,
): PlannedVsActual {
  const week = plan.weeks.find((w) => w.weekNumber === weekNumber);

  let plannedVolume = 0;
  let plannedSets = 0;
  let plannedReps = 0;
  let plannedWorkouts = 0;

  let actualVolume = 0;
  let actualSets = 0;
  let actualReps = 0;
  let actualWorkouts = 0;

  if (!week) {
    return { plannedVolume: 0, plannedSets: 0, plannedReps: 0, plannedWorkouts: 0, actualVolume: 0, actualSets: 0, actualReps: 0, actualWorkouts: 0, completionRate: 0 };
  }

  for (const day of week.days) {
    if (day.isRestDay || day.exercises.length === 0) continue;
    plannedWorkouts++;

    let dayAllCompleted = true;
    for (const set of day.exercises) {
      plannedSets++;
      plannedReps += set.targetReps;
      plannedVolume += set.targetWeight * set.targetReps;

      if (set.completed) {
        actualSets++;
        actualReps += set.actualReps ?? 0;
        actualVolume += (set.actualWeight ?? 0) * (set.actualReps ?? 0);
      } else {
        dayAllCompleted = false;
      }
    }

    if (dayAllCompleted && day.exercises.length > 0) {
      actualWorkouts++;
    }
  }

  const completionRate = plannedSets > 0 ? Math.round((actualSets / plannedSets) * 100) : 0;

  return {
    plannedVolume: Math.round(plannedVolume * 10) / 10,
    plannedSets,
    plannedReps,
    plannedWorkouts,
    actualVolume: Math.round(actualVolume * 10) / 10,
    actualSets,
    actualReps,
    actualWorkouts,
    completionRate,
  };
}

export function calculateProgress(plan: TrainingPlan, store: RecordStore): PlanProgress {
  const records = store.getRecordsByPlan(plan.id);
  const hasRecords = records.length > 0;

  const weeklyPercents = plan.weeks.map((week) => {
    const pva = computePlannedVsActualForWeek(plan, week.weekNumber, hasRecords);
    return pva.completionRate;
  });

  const completedWeeks = plan.weeks.filter((week) => {
    const pva = computePlannedVsActualForWeek(plan, week.weekNumber, hasRecords);
    return pva.completionRate >= 80;
  }).length;

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
      const allCompleted = day.exercises.length > 0 && day.exercises.every((s) => s.completed);
      if (allCompleted) {
        totalWorkoutsCompleted++;
        if (!streakBroken) currentStreak++;
      } else {
        streakBroken = true;
      }
    }
  }

  let totalPlanned: PlannedVsActual = { plannedVolume: 0, plannedSets: 0, plannedReps: 0, plannedWorkouts: 0, actualVolume: 0, actualSets: 0, actualReps: 0, actualWorkouts: 0, completionRate: 0 };
  let totalActual: PlannedVsActual = { plannedVolume: 0, plannedSets: 0, plannedReps: 0, plannedWorkouts: 0, actualVolume: 0, actualSets: 0, actualReps: 0, actualWorkouts: 0, completionRate: 0 };

  for (const week of plan.weeks) {
    const pva = computePlannedVsActualForWeek(plan, week.weekNumber, hasRecords);
    totalPlanned.plannedVolume += pva.plannedVolume;
    totalPlanned.plannedSets += pva.plannedSets;
    totalPlanned.plannedReps += pva.plannedReps;
    totalPlanned.plannedWorkouts += pva.plannedWorkouts;
    totalActual.actualVolume += pva.actualVolume;
    totalActual.actualSets += pva.actualSets;
    totalActual.actualReps += pva.actualReps;
    totalActual.actualWorkouts += pva.actualWorkouts;
  }

  totalPlanned.plannedVolume = Math.round(totalPlanned.plannedVolume * 10) / 10;
  totalActual.actualVolume = Math.round(totalActual.actualVolume * 10) / 10;
  totalActual.completionRate = overallCompletion;
  totalPlanned.completionRate = overallCompletion;

  return {
    planId: plan.id,
    totalWeeks: plan.totalWeeks,
    completedWeeks,
    overallCompletionPercent: overallCompletion,
    weeklyCompletionPercents: weeklyPercents,
    currentStreak,
    totalWorkoutsCompleted,
    totalWorkoutsPlanned,
    planned: totalPlanned,
    actual: totalActual,
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

  const records = store.getRecordsByWeek(plan.id, weekNumber);
  const hasRecords = records.length > 0;
  const pva = computePlannedVsActualForWeek(plan, weekNumber, hasRecords);

  const feedback = store.getFeedback(plan.id, weekNumber);

  const muscleDistribution: Partial<Record<MuscleGroup, number>> = {};
  const personalRecords: PersonalRecord[] = [];

  for (const day of week.days) {
    if (day.isRestDay) continue;

    for (const set of day.exercises) {
      const ex = library.findById(set.exerciseId);
      if (ex) {
        const reps = hasRecords && set.completed ? (set.actualReps ?? 0) : 0;
        for (const mg of ex.muscleGroups) {
          muscleDistribution[mg] = (muscleDistribution[mg] ?? 0) + reps;
        }
      }

      if (hasRecords && set.completed && (set.actualWeight ?? 0) > 0) {
        const exName = ex ? ex.name : set.exerciseId;
        personalRecords.push({
          exerciseId: set.exerciseId,
          exerciseName: exName,
          weight: set.actualWeight ?? 0,
          reps: set.actualReps ?? 0,
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

  const recommendations = generateRecommendations(pva.completionRate, feedback?.overallFatigue, feedback?.sleepQuality, personalRecords.length);

  const nextWeek = plan.weeks.find((w) => w.weekNumber === weekNumber + 1);
  const nextWeekPreview: WorkoutDay[] = nextWeek
    ? nextWeek.days.filter((d) => !d.isRestDay)
    : [];

  const configNotes = generateConfigNotes(plan, week);

  return {
    planId: plan.id,
    weekNumber,
    completionRate: pva.completionRate,
    planned: {
      plannedVolume: pva.plannedVolume,
      plannedSets: pva.plannedSets,
      plannedReps: pva.plannedReps,
      plannedWorkouts: pva.plannedWorkouts,
      actualVolume: 0,
      actualSets: 0,
      actualReps: 0,
      actualWorkouts: 0,
      completionRate: 0,
    },
    actual: {
      plannedVolume: pva.plannedVolume,
      plannedSets: pva.plannedSets,
      plannedReps: pva.plannedReps,
      plannedWorkouts: pva.plannedWorkouts,
      actualVolume: pva.actualVolume,
      actualSets: pva.actualSets,
      actualReps: pva.actualReps,
      actualWorkouts: pva.actualWorkouts,
      completionRate: pva.completionRate,
    },
    personalRecords,
    muscleGroupDistribution: muscleDistribution,
    fatigueTrend,
    recommendations,
    nextWeekPreview,
    configNotes,
  };
}

function generateRecommendations(
  completionRate: number,
  overallFatigue?: FatigueLevel,
  sleepQuality?: FatigueLevel,
  prCount?: number,
): string[] {
  const recs: string[] = [];

  if (completionRate === 0) {
    recs.push('本周尚未开始训练，请尽快安排训练时间');
  } else if (completionRate < 50) {
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
    recs.push('本周达成' + prCount + '项个人记录，继续突破！');
  }

  if (completionRate >= 80 && (overallFatigue ?? 5) <= 6) {
    recs.push('状态良好，可以尝试在主要复合动作上增加2-5%重量');
  }

  return recs;
}

function emptyReport(planId: string, weekNumber: number): WeeklyReport {
  const empty: PlannedVsActual = { plannedVolume: 0, plannedSets: 0, plannedReps: 0, plannedWorkouts: 0, actualVolume: 0, actualSets: 0, actualReps: 0, actualWorkouts: 0, completionRate: 0 };
  return {
    planId,
    weekNumber,
    completionRate: 0,
    planned: empty,
    actual: empty,
    personalRecords: [],
    muscleGroupDistribution: {},
    fatigueTrend: [],
    recommendations: ['暂无数据，完成训练后即可生成报告'],
    nextWeekPreview: [],
    configNotes: [],
  };
}

function generateConfigNotes(plan: TrainingPlan, week: TrainingWeek): string[] {
  const notes: string[] = [];
  const config = plan.configSnapshot;
  if (!config) return notes;

  if (config.equipment && config.equipment.length > 0) {
    const eqList = config.equipment.filter((e) => e !== 'none');
    if (eqList.length > 0) {
      notes.push('可用器械：' + eqList.join('、'));
    } else {
      notes.push('仅徒手训练，动作选择受限');
    }
  }

  if (config.limitations && config.limitations.length > 0) {
    const limDescs = config.limitations.map((l) => l.area + '（' + l.severity + '）');
    notes.push('身体限制：' + limDescs.join('、'));

    const avoidedIds = new Set<string>();
    for (const lim of config.limitations) {
      for (const moveId of lim.movementsToAvoid) {
        avoidedIds.add(moveId);
      }
    }

    const weekExerciseIds = new Set<string>();
    for (const day of week.days) {
      for (const set of day.exercises) {
        weekExerciseIds.add(set.exerciseId);
      }
    }

    const avoidedInWeek = [...avoidedIds].filter((id) => weekExerciseIds.has(id));
    if (avoidedInWeek.length > 0) {
      notes.push('本周仍有限制动作出现在计划中，建议检查或替换');
    }
  }

  if (config.preferredExerciseIds && config.preferredExerciseIds.length > 0) {
    const weekExerciseIds = new Set<string>();
    for (const day of week.days) {
      for (const set of day.exercises) {
        weekExerciseIds.add(set.exerciseId);
      }
    }
    const usedPreferred = config.preferredExerciseIds.filter((id) => weekExerciseIds.has(id));
    const unusedPreferred = config.preferredExerciseIds.filter((id) => !weekExerciseIds.has(id));
    if (usedPreferred.length > 0) {
      notes.push('已优先安排' + usedPreferred.length + '个偏好动作');
    }
    if (unusedPreferred.length > 0) {
      notes.push(unusedPreferred.length + '个偏好动作因器械或限制未能安排');
    }
  }

  const restDays = week.days.filter((d) => d.isRestDay).length;
  const trainingDays = week.days.filter((d) => !d.isRestDay && d.exercises.length > 0).length;
  if (trainingDays < config.availableDaysPerWeek) {
    notes.push('本周实际训练' + trainingDays + '天，少于计划的' + config.availableDaysPerWeek + '天（部分训练日因条件不足转为休息日）');
  }

  return notes;
}
