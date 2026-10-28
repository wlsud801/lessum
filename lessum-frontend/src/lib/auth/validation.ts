import { MIN_PASSWORD_LENGTH } from './constants'

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(email: string) {
  if (!email) {
    return '이메일을 입력해주세요.'
  }
  if (!EMAIL_PATTERN.test(email)) {
    return '올바른 이메일 형식이 아닙니다.'
  }
  return undefined
}

export function validatePassword(password: string) {
  if (!password) {
    return '비밀번호를 입력해주세요.'
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`
  }
  return undefined
}

export function validatePasswordConfirm(
  password: string,
  passwordConfirm: string,
) {
  if (!passwordConfirm) {
    return '비밀번호 확인을 입력해주세요.'
  }
  if (password !== passwordConfirm) {
    return '비밀번호 확인이 일치하지 않습니다.'
  }
  return undefined
}
