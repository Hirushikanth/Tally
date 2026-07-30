export class PostingEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PostingEngineError';
  }
}

export class ZeroSumError extends PostingEngineError {
  constructor(sum: number) {
    super(`Postings do not balance: sum is ${sum} (expected 0)`);
    this.name = 'ZeroSumError';
  }
}

export class InvalidInputError extends PostingEngineError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInputError';
  }
}
