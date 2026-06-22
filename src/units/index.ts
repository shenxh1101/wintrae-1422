import { UnitSystem, TrainingPlan, ExerciseSet, WorkoutDay, TrainingWeek } from '../types';

const KG_TO_LB = 2.20462;
const LB_TO_KG = 1 / KG_TO_LB;

export function convertWeight(value: number, from: UnitSystem, to: UnitSystem): number {
  if (from === to) return value;
  if (from === 'metric' && to === 'imperial') {
    return Math.round(value * KG_TO_LB * 10) / 10;
  }
  return Math.round(value * LB_TO_KG * 10) / 10;
}

export function convertPlanUnits(plan: TrainingPlan, targetUnit: UnitSystem): TrainingPlan {
  if (plan.unitSystem === targetUnit) return plan;

  const convertSet = (set: ExerciseSet): ExerciseSet => ({
    ...set,
    targetWeight: convertWeight(set.targetWeight, plan.unitSystem, targetUnit),
    actualWeight: set.actualWeight !== undefined
      ? convertWeight(set.actualWeight, plan.unitSystem, targetUnit)
      : undefined,
  });

  const convertDay = (day: WorkoutDay): WorkoutDay => ({
    ...day,
    exercises: day.exercises.map(convertSet),
    estimatedDurationMinutes: day.estimatedDurationMinutes,
  });

  const convertWeek = (week: TrainingWeek): TrainingWeek => ({
    ...week,
    days: week.days.map(convertDay),
    totalVolume: week.days.reduce(
      (sum, day) => sum + day.exercises.reduce((s, set) => s + convertWeight(set.targetWeight, plan.unitSystem, targetUnit) * set.targetReps, 0),
      0,
    ),
  });

  return {
    ...plan,
    weeks: plan.weeks.map(convertWeek),
    unitSystem: targetUnit,
    updatedAt: new Date().toISOString(),
  };
}

export function formatWeight(value: number, unit: UnitSystem): string {
  return `${value} ${unit === 'metric' ? 'kg' : 'lb'}`;
}

export function getUnitLabel(unit: UnitSystem): string {
  return unit === 'metric' ? '公斤' : '磅';
}
