import {
  Exercise,
  ExerciseFilter,
  MuscleGroup,
  EquipmentCategory,
} from '../types';
import { defaultExercises } from './default-exercises';
import {
  ExerciseNotFoundError,
  DuplicateExerciseError,
  SubstitutionError,
} from '../errors';

export class ExerciseLibrary {
  private exercises: Map<string, Exercise> = new Map();

  constructor() {
    for (const ex of defaultExercises) {
      this.exercises.set(ex.id, { ...ex });
    }
  }

  register(exercise: Exercise): void {
    if (this.exercises.has(exercise.id) && !exercise.isCustom) {
      throw new DuplicateExerciseError(exercise.id);
    }
    this.exercises.set(exercise.id, { ...exercise, isCustom: true });
  }

  registerMany(exercises: Exercise[]): void {
    for (const ex of exercises) {
      this.register(ex);
    }
  }

  getById(id: string): Exercise {
    const ex = this.exercises.get(id);
    if (!ex) throw new ExerciseNotFoundError(id);
    return { ...ex };
  }

  findById(id: string): Exercise | undefined {
    const ex = this.exercises.get(id);
    return ex ? { ...ex } : undefined;
  }

  query(filter?: ExerciseFilter): Exercise[] {
    let results = Array.from(this.exercises.values());

    if (!filter) return results.map((e) => ({ ...e }));

    if (filter.muscleGroups && filter.muscleGroups.length > 0) {
      results = results.filter((e) =>
        e.muscleGroups.some((mg) =>
          (filter.muscleGroups as MuscleGroup[]).includes(mg),
        ),
      );
    }

    if (filter.equipment && filter.equipment.length > 0) {
      results = results.filter((e) =>
        e.equipment.some((eq) =>
          (filter.equipment as EquipmentCategory[]).includes(eq),
        ),
      );
    }

    if (filter.category) {
      results = results.filter((e) => e.category === filter.category);
    }

    if (filter.difficulty) {
      results = results.filter((e) => e.difficulty === filter.difficulty);
    }

    if (filter.ids && filter.ids.length > 0) {
      results = results.filter((e) => filter.ids!.includes(e.id));
    }

    if (filter.nameContains) {
      const term = filter.nameContains.toLowerCase();
      results = results.filter(
        (e) =>
          e.name.toLowerCase().includes(term) ||
          e.nameEn.toLowerCase().includes(term),
      );
    }

    return results.map((e) => ({ ...e }));
  }

  getAll(): Exercise[] {
    return Array.from(this.exercises.values()).map((e) => ({ ...e }));
  }

  getReplacements(exerciseId: string, availableEquipment?: EquipmentCategory[]): Exercise[] {
    const exercise = this.getById(exerciseId);
    const replacements: Exercise[] = [];

    for (const repId of exercise.replacementIds) {
      const rep = this.exercises.get(repId);
      if (!rep) continue;

      if (availableEquipment && availableEquipment.length > 0) {
        const hasEquipment = rep.equipment.some(
          (eq) =>
            eq === 'none' ||
            (availableEquipment as EquipmentCategory[]).includes(eq),
        );
        if (!hasEquipment) continue;
      }

      replacements.push({ ...rep });
    }

    return replacements;
  }

  substitute(
    planExercises: { exerciseId: string }[],
    targetExerciseId: string,
    replacementId: string,
    availableEquipment?: EquipmentCategory[],
  ): { exerciseId: string }[] {
    const target = this.findById(targetExerciseId);
    const replacement = this.findById(replacementId);

    if (!target) {
      throw new SubstitutionError(targetExerciseId, 'Target exercise not found');
    }
    if (!replacement) {
      throw new SubstitutionError(replacementId, 'Replacement exercise not found');
    }

    if (!target.replacementIds.includes(replacementId)) {
      const hasCommonMuscles = target.muscleGroups.some((mg) =>
        replacement.muscleGroups.includes(mg),
      );
      if (!hasCommonMuscles) {
        throw new SubstitutionError(
          targetExerciseId,
          `Replacement ${replacementId} does not target the same muscle groups`,
        );
      }
    }

    if (availableEquipment && availableEquipment.length > 0) {
      const hasEquipment = replacement.equipment.some(
        (eq) =>
          eq === 'none' ||
          (availableEquipment as EquipmentCategory[]).includes(eq),
      );
      if (!hasEquipment) {
        throw new SubstitutionError(
          replacementId,
          'Replacement exercise requires equipment not available',
        );
      }
    }

    return planExercises.map((item) =>
      item.exerciseId === targetExerciseId
        ? { exerciseId: replacementId }
        : item,
    );
  }

  removeCustom(id: string): boolean {
    const ex = this.exercises.get(id);
    if (!ex) return false;
    if (!ex.isCustom) return false;
    return this.exercises.delete(id);
  }

  count(): number {
    return this.exercises.size;
  }

  countCustom(): number {
    return Array.from(this.exercises.values()).filter((e) => e.isCustom).length;
  }
}
