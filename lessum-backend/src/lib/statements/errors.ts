export class StatementFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StatementFormatError'
  }
}
