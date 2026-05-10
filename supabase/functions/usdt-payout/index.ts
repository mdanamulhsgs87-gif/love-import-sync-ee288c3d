import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createWalletClient, createPublicClient, http, encodeFunctionData, parseUnits, getAddress, isAddress } from 'npm:viem@2.21.55'
import { privateKeyToAccount } from 'npm:viem@2.21.55/accounts'
import { base } from 'npm:viem@2.21.55/chains'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// USDT on Base mainnet (6 decimals)
const USDT_BASE = '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' as const
const ERC20_TRANSFER_ABI = [{
  name: 'transfer', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}] as const

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function getSettings() {
  const { data } = await supabase.from('settings').select('key, value')
  const map: Record<string, string> = {}
  data?.forEach((s: any) => { map[s.key] = s.value })
  return {
    enabled: (map.usdtPayoutEnabled || 'off') === 'on',
    rate: parseFloat(map.usdtRatePerAccount || '0.05') || 0.05,
    minWithdraw: parseFloat(map.usdtMinWithdraw || '0.5') || 0.5,
    feePercent: parseFloat(map.usdtFeePercent || '2') || 2,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method !== 'POST') return json({ error: 'POST required' }, 405)
    const body = await req.json().catch(() => ({}))
    const { user_id, recipient, amount } = body as { user_id?: number; recipient?: string; amount?: number }

    if (!user_id || !recipient || !amount) {
      return json({ error: 'user_id, recipient, amount required' }, 400)
    }
    if (!isAddress(recipient)) {
      return json({ error: 'Invalid Base address (must start with 0x)' }, 400)
    }

    const settings = await getSettings()
    if (!settings.enabled) return json({ error: 'USDT payout is disabled' }, 403)
    if (amount < settings.minWithdraw) {
      return json({ error: `Minimum withdraw is ${settings.minWithdraw} USDT` }, 400)
    }

    // Fetch user
    const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single()
    if (!user) return json({ error: 'User not found' }, 404)
    if (user.is_blocked) return json({ error: 'Account blocked' }, 403)

    // Calculate USDT balance: (key_count + reverify_count - usdt_paid_count) * rate
    const totalCount = (user.key_count || 0) + (user.reverify_count || 0)
    const paidCount = user.usdt_paid_count || 0
    const availableCount = Math.max(0, totalCount - paidCount)
    const accountsUsdt = +(availableCount * settings.rate).toFixed(6)
    const referralUsdt = Number(user.referral_usdt_earnings || 0)
    const usdtBalance = +(accountsUsdt + referralUsdt).toFixed(6)

    if (amount > usdtBalance + 1e-9) {
      return json({ error: `Insufficient USDT balance (you have ${usdtBalance})` }, 400)
    }

    // Fee calculation — user receives amount - fee, our wallet keeps the fee
    const fee = +(amount * settings.feePercent / 100).toFixed(6)
    const userReceives = +(amount - fee).toFixed(6)

    // Setup wallet
    const pk = Deno.env.get('BASE_WALLET_PRIVATE_KEY')
    if (!pk) return json({ error: 'Wallet not configured' }, 500)
    const account = privateKeyToAccount(pk.startsWith('0x') ? pk as `0x${string}` : `0x${pk}` as `0x${string}`)
    const rpcUrl = Deno.env.get('BASE_RPC_URL') || 'https://mainnet.base.org'
    const transport = http(rpcUrl)
    const publicClient = createPublicClient({ chain: base, transport })
    const walletClient = createWalletClient({ account, chain: base, transport })

    // Encode ERC20 transfer (USDT = 6 decimals)
    const data = encodeFunctionData({
      abi: ERC20_TRANSFER_ABI, functionName: 'transfer',
      args: [getAddress(recipient), parseUnits(userReceives.toString(), 6)],
    })

    // Send tx
    const hash = await walletClient.sendTransaction({ to: USDT_BASE, data, value: 0n })

    // Deduct first from referral earnings, then from accounts pool
    let remaining = amount
    let newReferralEarnings = referralUsdt
    if (remaining > 0 && newReferralEarnings > 0) {
      const useFromReferral = Math.min(remaining, newReferralEarnings)
      newReferralEarnings = +(newReferralEarnings - useFromReferral).toFixed(6)
      remaining = +(remaining - useFromReferral).toFixed(6)
    }
    let newPaidCount = paidCount
    if (remaining > 0) {
      newPaidCount = paidCount + Math.ceil(remaining / settings.rate)
    }
    await supabase.from('users')
      .update({ usdt_paid_count: newPaidCount, referral_usdt_earnings: newReferralEarnings })
      .eq('id', user_id)

    // Record transaction (amount in USDT cents = amount*100 since column is integer)
    await supabase.from('transactions').insert({
      user_id, type: 'usdt_payout', amount: Math.round(amount * 100),
      details: `USDT (Base) → ${recipient.slice(0, 8)}…${recipient.slice(-6)} | recv ${userReceives} | fee ${fee} | tx ${hash}`,
      status: 'completed',
    })

    // Telegram notification (best-effort)
    const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const tgChat = Deno.env.get('TELEGRAM_CHAT_ID')
    if (tgToken && tgChat) {
      fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tgChat, parse_mode: 'HTML',
          text: `💸 <b>USDT Auto-Payout</b>\n👤 User: ${user.guest_id}\n💰 ${userReceives} USDT\n🏦 Fee: ${fee}\n📍 ${recipient}\n🔗 <code>${hash}</code>`,
        }),
      }).catch(() => {})
    }

    return json({ success: true, tx_hash: hash, received: userReceives, fee, new_balance: usdtBalance - amount })
  } catch (err: any) {
    console.error('usdt-payout error:', err)
    return json({ error: err?.shortMessage || err?.message || 'Payout failed' }, 500)
  }
})
