import axios from 'axios'

export async function saveStatementPassword(
  accessToken: string,
  issuer: string,
  statementPassword: string,
  keep: boolean,
): Promise<void> {
  await axios.put(
    `${process.env.API_BASE_URL}/collect-settings/cards/${issuer}/statement-password`,
    { statement_password: statementPassword, keep },
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
}
