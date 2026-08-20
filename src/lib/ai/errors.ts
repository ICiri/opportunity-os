export class AIConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIConfigurationError';
  }
}

export class AIResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIResponseError';
  }
}

export class AIGroundingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIGroundingError';
  }
}
