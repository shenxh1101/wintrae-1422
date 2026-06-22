import {
  TrainingPlan,
  FatigueFeedback,
  PlanAdjustment,
  AdjustmentAction,
  FatigueLevel,
  MuscleGroup,
  ExerciseSet,
} from '../types';
import { ExerciseLibrary } from '../exercise';
import { computeSetsForWeek, getProgressionConfig } from '../plan/progression';

export function adjustPlan(
  plan: TrainingPlan,
  feedback: FatigueFeedback,
  library: ExerciseLibrary,
): { adjustedPlan: TrainingPlan; adjustment: PlanAdjustment } {
  const actions: AdjustmentAction[] = [];
  let adjustedPlan = { ...plan, weeks: plan.weeks.map((w) => ({ ...w })) };

  const targetWeekIndex = plan.weeks.findIndex((w) => w.weekNumber === feedback.weekNumber + 1);
  if (targetWeekIndex === -1) {
    return {
      adjustedPlan: plan,
      adjustment: {
        planId: plan.id,
        weekNumber: feedback.weekNumber + 1,
        adjustments: [],
        reason: 'No further weeks to adjust',
      },
    };
  }

  if (feedback.overallFatigue >= 8) {
    actions.push({
      type: 'modify_weight',
      newValue: -15,
      description: '整体疲劳过高，下周训练重量降低15%',
    });
    adjustedPlan = applyWeightReduction(adjustedPlan, targetWeekIndex, 0.85);

    if (feedback.overallFatigue >= 9) {
      actions.push({
        type: 'modify_sets',
        newValue: -1,
        description: '极端疲劳，下周每动作减少1组',
      });
      adjustedPlan = applySetReduction(adjustedPlan, targetWeekIndex);
    }
  }

  if (feedback.overallFatigue <= 3) {
    actions.push({
      type: 'modify_weight',
      newValue: 5,
      description: '疲劳感较低，下周训练重量增加5%',
    });
    adjustedPlan = applyWeightReduction(adjustedPlan, targetWeekIndex, 1.05);
  }

  if (feedback.sleepQuality <= 3) {
    actions.push({
      type: 'modify_sets',
      newValue: -1,
      description: '睡眠质量差，减少训练量',
    });
    adjustedPlan = applySetReduction(adjustedPlan, targetWeekIndex);
  }

  if (feedback.muscleFatigue) {
    for (const [muscle, fatigue] of Object.entries(feedback.muscleFatigue)) {
      if ((fatigue as number) >= 8) {
        actions.push({
          type: 'modify_reps',
          newValue: -2,
          description: `${muscle}疲劳过高，减少对应动作每组次数2次`,
        });
        adjustedPlan = applyRepsReductionForMuscle(
          adjustedPlan,
          targetWeekIndex,
          muscle as MuscleGroup,
          library,
        );
      }
    }
  }

  const reason = generateAdjustmentReason(feedback);

  return {
    adjustedPlan: {
      ...adjustedPlan,
      updatedAt: new Date().toISOString(),
    },
    adjustment: {
      planId: plan.id,
      weekNumber: feedback.weekNumber + 1,
      adjustments: actions,
      reason,
    },
  };
}

function applyWeightReduction(plan: TrainingPlan, weekIndex: number, factor: number): TrainingPlan {
  const weeks = plan.weeks.map((w, i) => {
    if (i !== weekIndex) return w;
    return {
      ...w,
      days: w.days.map((d) => ({
        ...d,
        exercises: d.exercises.map((s) => ({
          ...s,
          targetWeight: Math.round(s.targetWeight * factor * 10) / 10,
        })),
      })),
    };
  });
  return { ...plan, weeks };
}

function applySetReduction(plan: TrainingPlan, weekIndex: number): TrainingPlan {
  const weeks = plan.weeks.map((w, i) => {
    if (i !== weekIndex) return w;
    return {
      ...w,
      days: w.days.map((d) => {
        if (d.isRestDay || d.exercises.length === 0) return d;
        const grouped = new Map<string, ExerciseSet[]>();
        for (const s of d.exercises) {
          if (!grouped.has(s.exerciseId)) grouped.set(s.exerciseId, []);
          grouped.get(s.exerciseId)!.push(s);
        }
        const reducedExercises: ExerciseSet[] = [];
        for (const [, sets] of grouped) {
          const trimmed = sets.slice(0, Math.max(1, sets.length - 1));
          reducedExercises.push(...trimmed.map((s, idx) => ({ ...s, setIndex: idx + 1 })));
        }
        return { ...d, exercises: reducedExercises };
      }),
    };
  });
  return { ...plan, weeks };
}

function applyRepsReductionForMuscle(
  plan: TrainingPlan,
  weekIndex: number,
  muscle: MuscleGroup,
  library: ExerciseLibrary,
): TrainingPlan {
  const weeks = plan.weeks.map((w, i) => {
    if (i !== weekIndex) return w;
    return {
      ...w,
      days: w.days.map((d) => ({
        ...d,
        exercises: d.exercises.map((s) => {
          const ex = library.findById(s.exerciseId);
          if (ex && ex.muscleGroups.includes(muscle)) {
            return { ...s, targetReps: Math.max(3, s.targetReps - 2) };
          }
          return s;
        }),
      })),
    };
  });
  return { ...plan, weeks };
}

function generateAdjustmentReason(feedback: FatigueFeedback): string {
  const parts: string[] = [];

  if (feedback.overallFatigue >= 8) {
    parts.push(`整体疲劳等级${feedback.overallFatigue}/10，需要减载`);
  } else if (feedback.overallFatigue <= 3) {
    parts.push('恢复良好，可适当加量');
  }

  if (feedback.sleepQuality <= 3) {
    parts.push('睡眠质量不佳，降低训练量');
  }

  if (feedback.muscleFatigue) {
    const highFatigue = Object.entries(feedback.muscleFatigue)
      .filter(([, v]) => (v as number) >= 8)
      .map(([k]) => k);
    if (highFatigue.length > 0) {
      parts.push(`${highFatigue.join('、')}疲劳度较高，针对性减量`);
    }
  }

  if (parts.length === 0) {
    parts.push('训练状态正常，维持当前计划');
  }

  return parts.join('；');
}
