export class GameError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 422,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'GameError';
  }
}
