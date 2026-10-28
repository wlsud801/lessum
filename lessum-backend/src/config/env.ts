import 'dotenv/config'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`환경변수 ${name} 이(가) 설정되지 않았습니다.`)
  }
  return value
}

export const env = {
  port: Number(process.env.PORT) || 4000,
  frontendUrl: requireEnv('FRONTEND_URL'),
  supabaseUrl: requireEnv('SUPABASE_URL'),
  supabaseAnonKey: requireEnv('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
}
