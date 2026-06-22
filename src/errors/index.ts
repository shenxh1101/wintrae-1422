export class FitnessSDKError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'FitnessSDKError';
    this.code = code;
    this.details = details;
  }
}

export class InvalidConfigError extends FitnessSDKError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('INVALID_CONFIG', message, details);
    this.name = 'InvalidConfigError';
  }
}

export class ExerciseNotFoundError extends FitnessSDKError {
  constructor(exerciseId: string) {
    super('EXERCISE_NOT_FOUND', `Exercise not found: ${exerciseId}`, { exerciseId });
    this.name = 'ExerciseNotFoundError';
  }
}

export class PlanNotFoundError extends FitnessSDKError {
  constructor(planId: string) {
    super('PLAN_NOT_FOUND', `Training plan not found: ${planId}`, { planId });
    this.name = 'PlanNotFoundError';
  }
}

export class RecordNotFoundError extends FitnessSDKError {
  constructor(recordId: string) {
    super('RECORD_NOT_FOUND', `Training record not found: ${recordId}`, { recordId });
    this.name = 'RecordNotFoundError';
  }
}

export class SubstitutionError extends FitnessSDKError {
  constructor(exerciseId: string, reason: string) {
    super('SUBSTITUTION_FAILED', `Cannot substitute exercise ${exerciseId}: ${reason}`, { exerciseId, reason });
    this.name = 'SubstitutionError';
  }
}

export class DuplicateExerciseError extends FitnessSDKError {
  constructor(exerciseId: string) {
    super('DUPLICATE_EXERCISE', `Exercise already exists: ${exerciseId}`, { exerciseId });
    this.name = 'DuplicateExerciseError';
  }
}

export class InvalidFeedbackError extends FitnessSDKError {
  constructor(message: string) {
    super('INVALID_FEEDBACK', message);
    this.name = 'InvalidFeedbackError';
  }
}

export class NoAvailableEquipmentError extends FitnessSDKError {
  constructor() {
    super('NO_AVAILABLE_EQUIPMENT', 'No exercises available for the given equipment constraints');
    this.name = 'NoAvailableEquipmentError';
  }
}

export class InsufficientDaysError extends FitnessSDKError {
  constructor(requested: number, minimum: number) {
    super(
      'INSUFFICIENT_DAYS',
      `Requested ${requested} days per week, but at least ${minimum} is required for the selected goal`,
      { requested, minimum },
    );
    this.name = 'InsufficientDaysError';
  }
}
