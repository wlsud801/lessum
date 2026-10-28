export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export const unauthorized = () =>
  new ApiError(401, 'UNAUTHORIZED', '로그인이 필요합니다.')
