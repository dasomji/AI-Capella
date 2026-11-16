export class DomainError extends Error {
  constructor(
    public code: string,
    public status = 400,
    public current?: unknown,
  ) {
    super(code);
  }
}
