import { ApiError } from '../lib/errors.js'
import { supabaseAdmin } from '../lib/supabase.js'

export interface PaymentMethodItem {
  id: string
  method_type: string
  nickname: string
}

export async function getPaymentMethods(
  userId: string,
): Promise<PaymentMethodItem[]> {
  const rows = await supabaseAdmin
    .from('payment_methods')
    .select('id, method_type, nickname')
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('created_at', { ascending: true })

  if (rows.error) {
    throw new ApiError(
      500,
      'PAYMENT_METHODS_LOAD_FAILED',
      '결제 수단을 불러오지 못했습니다.',
    )
  }
  return rows.data
}
