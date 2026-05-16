/**
 * walletService.ts
 * Secure wallet operations — all go through SECURITY DEFINER DB functions.
 * NEVER call supabase.from('wallet').update() or .from('wallet_transactions').insert() directly.
 */
import { supabase } from './supabase'; // adjust path to match your project

/**
 * Deduct from wallet (server-side auth check, positive amounts only).
 * Returns true on success, false if insufficient funds.
 */
export async function deductWallet(
  userId: string,
  amount: number,
  description: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('deduct_wallet', {
    p_user_id: userId,
    p_amount: amount,
    p_description: description,
  });

  if (error) {
    console.error('deductWallet error:', error.message);
    throw new Error(error.message);
  }

  return data as boolean;
}

/**
 * Top up wallet (server-side auth check, positive amounts only).
 * Returns true on success.
 */
export async function topupWallet(
  userId: string,
  amount: number,
  description: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('topup_wallet', {
    p_user_id: userId,
    p_amount: amount,
    p_description: description,
  });

  if (error) {
    console.error('topupWallet error:', error.message);
    throw new Error(error.message);
  }

  return data as boolean;
}

/**
 * Get wallet balance for current user.
 */
export async function getWalletBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('wallet')
    .select('balance_php')
    .eq('user_id', userId)
    .single();

  if (error) throw new Error(error.message);
  return Number(data?.balance_php ?? 0);
}

/**
 * Get transaction history.
 * NOTE: amount_php is now always POSITIVE. The sign is determined by the type:
 *   'topup'   → positive (money in)
 *   'payment' → negative display (money out)
 *   'refund'  → positive (money in)
 */
export async function getWalletTransactions(userId: string) {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('id, type, amount_php, description, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  // Normalize display sign based on type
  return (data ?? []).map((tx) => ({
    ...tx,
    display_amount:
      tx.type === 'payment'
        ? -Math.abs(Number(tx.amount_php))
        : Math.abs(Number(tx.amount_php)),
  }));
}
