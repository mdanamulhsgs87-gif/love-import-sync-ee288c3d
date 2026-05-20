const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

async function getWalletSettings() {
  const { data } = await supabase.from('settings').select('key, value').in('key', ['rewardRate', 'usdtToBdtRate', 'minWithdraw'])
  const map: Record<string, string> = {}
  data?.forEach((s: any) => { map[s.key] = s.value })
  return {
    rewardRate: parseFloat(map.rewardRate || '40') || 40,
    usdtToBdt: parseFloat(map.usdtToBdtRate || '124') || 124,
    minWithdraw: parseInt(map.minWithdraw || '50') || 50,
  }
}

async function getSharedBalance(user: any) {
  const settings = await getWalletSettings()
  const { data: spendRows } = await supabase
    .from('transactions')
    .select('amount,type,status')
    .eq('user_id', user.id)
    .in('type', ['withdrawal', 'recharge'])
    .in('status', ['pending', 'processing', 'completed'])
  const spentBdt = (spendRows || []).reduce((sum: number, tx: any) => sum + (Number(tx.amount) || 0), 0)
  const spendableCount = Math.max(0, Number(user.reverify_count || 0) - Number(user.usdt_paid_count || 0))
  const referralUsdt = Number(user.referral_usdt_earnings || 0)
  const grossBdt = Math.floor(spendableCount * settings.rewardRate + referralUsdt * settings.usdtToBdt)
  const availableBdt = Math.max(0, grossBdt - spentBdt)
  return { ...settings, availableBdt, availableUsdt: +(availableBdt / settings.usdtToBdt).toFixed(6) }
}

// All available API features (excluding feed, youtube, reels, messenger)
const AVAILABLE_FEATURES = [
  'face-verify', 'face-capture', 're-verify', 'wallet-binding',
  'balance-check', 'withdrawal', 'key-submit', 'user-profile',
  'user-login', 'transactions', 'transfer-request', 'settings',
  'stories', 'admin-panel',
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/').filter(Boolean)
    const action = pathParts[pathParts.length - 1] || ''

    // Public: list features
    if (action === 'features' && req.method === 'GET') {
      return json({ features: AVAILABLE_FEATURES, _branding: { sponsor: 'Good-App' } })
    }

    // Validate API key
    const apiKey = req.headers.get('x-api-key')
    if (!apiKey) return json({ error: 'API key required. Pass x-api-key header.' }, 401)

    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('*, api_key_features(*)')
      .eq('api_key', apiKey)
      .eq('is_active', true)
      .single()

    if (keyError || !keyData) return json({ error: 'Invalid or inactive API key' }, 403)

    const enabledFeatures = (keyData.api_key_features || [])
      .filter((f: any) => f.is_enabled)
      .map((f: any) => f.feature_name)

    const branding = { sponsor: keyData.branding_text || 'Powered by Good-App' }

    function checkFeature(name: string) {
      if (!enabledFeatures.includes(name)) {
        throw { status: 403, message: `Feature "${name}" not enabled for this API key` }
      }
    }

    switch (action) {
      // ===== INFO =====
      case 'info': {
        return json({ key_name: keyData.name, enabled_features: enabledFeatures, _branding: branding })
      }

      case 'check-feature': {
        const feature = url.searchParams.get('feature')
        if (!feature) return json({ error: 'feature param required' }, 400)
        return json({ feature, enabled: enabledFeatures.includes(feature), _branding: branding })
      }

      // ===== SETTINGS =====
      case 'settings': {
        checkFeature('settings')
        const { data: settings } = await supabase.from('settings').select('key, value')
        const safeKeys = ['rewardRate', 'buyStatus', 'bonusStatus', 'bonusTarget', 'minWithdraw', 'paymentMode', 'minRequestVerified', 'minRequestTarget']
        const result: Record<string, string> = {}
        settings?.forEach((s: any) => { if (safeKeys.includes(s.key)) result[s.key] = s.value })
        return json({ settings: result, _branding: branding })
      }

      // ===== USER LOGIN =====
      case 'user-login': {
        checkFeature('user-login')
        if (req.method !== 'POST') return json({ error: 'POST required' }, 405)
        const body = await req.json()
        if (!body.guest_id) return json({ error: 'guest_id required' }, 400)
        
        // Find or create user
        let { data: user } = await supabase
          .from('users')
          .select('id, guest_id, display_name, is_verified_badge, balance, key_count, avatar_url, reverify_count, is_blocked')
          .eq('guest_id', body.guest_id.trim())
          .single()

        if (!user && body.display_name) {
          const { data: newUser, error } = await supabase
            .from('users')
            .insert({ guest_id: body.guest_id.trim(), display_name: body.display_name || null })
            .select('id, guest_id, display_name, is_verified_badge, balance, key_count, avatar_url, reverify_count, is_blocked')
            .single()
          if (error) return json({ error: error.message }, 400)
          user = newUser
        }

        if (!user) return json({ error: 'User not found. Send display_name to create.' }, 404)
        if (user.is_blocked) return json({ error: 'Account is blocked' }, 403)
        return json({ user, _branding: branding })
      }

      // ===== USER PROFILE =====
      case 'user-profile': {
        checkFeature('user-profile')
        const userId = url.searchParams.get('user_id')
        const guestId = url.searchParams.get('guest_id')
        if (!userId && !guestId) return json({ error: 'user_id or guest_id required' }, 400)
        
        let q = supabase.from('users').select('id, guest_id, display_name, is_verified_badge, balance, key_count, avatar_url, reverify_count, created_at, cover_url')
        if (userId) q = q.eq('id', parseInt(userId))
        else q = q.eq('guest_id', guestId!)
        
        const { data: user } = await q.single()
        if (!user) return json({ error: 'User not found' }, 404)
        return json({ user, _branding: branding })
      }

      // ===== BALANCE CHECK =====
      case 'balance-check': {
        checkFeature('balance-check')
        const uid = url.searchParams.get('user_id')
        if (!uid) return json({ error: 'user_id required' }, 400)
        const { data: u } = await supabase.from('users').select('*').eq('id', parseInt(uid)).single()
        if (!u) return json({ error: 'User not found' }, 404)
        const shared = await getSharedBalance(u)
        return json({ ...u, balance: shared.availableBdt, usdt_balance: shared.availableUsdt, _branding: branding })
      }

      // ===== TRANSACTIONS =====
      case 'transactions': {
        checkFeature('transactions')
        const uid2 = url.searchParams.get('user_id')
        if (!uid2) return json({ error: 'user_id required' }, 400)
        const limit = parseInt(url.searchParams.get('limit') || '50')
        const { data: txs } = await supabase.from('transactions').select('id, type, amount, details, status, created_at').eq('user_id', parseInt(uid2)).order('created_at', { ascending: false }).limit(Math.min(limit, 100))
        return json({ transactions: txs || [], _branding: branding })
      }

      // ===== KEY SUBMIT =====
      case 'key-submit': {
        checkFeature('key-submit')
        if (req.method !== 'POST') return json({ error: 'POST required' }, 405)
        const body = await req.json()
        if (!body.user_id) return json({ error: 'user_id required' }, 400)

        const { data: user } = await supabase.from('users').select('*').eq('id', body.user_id).single()
        if (!user) return json({ error: 'User not found' }, 404)
        if (user.is_blocked) return json({ error: 'Account blocked' }, 403)

        const newKeyCount = (user.key_count || 0) + 1
        await supabase.from('users').update({ key_count: newKeyCount }).eq('id', user.id)

        await supabase.from('transactions').insert({
          user_id: user.id, type: 'earning', amount: 0,
          details: `ভেরিফাইড কী #${newKeyCount}`, status: 'completed',
        })

        return json({ key_count: newKeyCount, balance: user.balance, message: `ভেরিফাইড! মোট কাউন্ট: ${newKeyCount}`, _branding: branding })
      }

      // ===== FACE CAPTURE / WALLET BINDING =====
      case 'wallet-binding': {
        checkFeature('wallet-binding')
        if (req.method === 'GET') {
          // Get bindings for a user
          const uid = url.searchParams.get('user_id')
          if (!uid) return json({ error: 'user_id required' }, 400)
          const { data } = await supabase.from('face_wallet_bindings').select('id, wallet_address, face_photo_url, created_at').eq('user_id', parseInt(uid)).order('created_at', { ascending: false })
          return json({ bindings: data || [], _branding: branding })
        }
        if (req.method === 'POST') {
          const body = await req.json()
          if (!body.user_id || !body.wallet_address || !body.private_key || !body.face_photo_url) {
            return json({ error: 'user_id, wallet_address, private_key, face_photo_url required' }, 400)
          }
          const { data, error } = await supabase.from('face_wallet_bindings').insert({
            user_id: body.user_id, wallet_address: body.wallet_address,
            private_key: body.private_key, face_photo_url: body.face_photo_url,
          }).select('id, wallet_address, created_at').single()
          if (error) {
            if (error.code === '23505') return json({ error: 'This wallet is already bound' }, 409)
            return json({ error: error.message }, 400)
          }
          return json({ binding: data, message: 'Wallet bound successfully', _branding: branding })
        }
        return json({ error: 'GET or POST required' }, 405)
      }

      // ===== FACE VERIFY (check whitelist status) =====
      case 'face-verify': {
        checkFeature('face-verify')
        if (req.method === 'GET') {
          const wallet = url.searchParams.get('wallet_address')
          if (!wallet) return json({ error: 'wallet_address required' }, 400)
          const { data } = await supabase.from('face_wallet_bindings').select('id, wallet_address, user_id, created_at').eq('wallet_address', wallet).single()
          if (!data) return json({ verified: false, message: 'Wallet not found' }, 404)
          return json({ verified: true, binding: data, _branding: branding })
        }
        return json({ error: 'GET required' }, 405)
      }

      // ===== RE-VERIFY =====
      case 're-verify': {
        checkFeature('re-verify')
        if (req.method === 'GET') {
          // Get pending re-verify tasks for user
          const uid = url.searchParams.get('user_id')
          if (!uid) return json({ error: 'user_id required' }, 400)
          const { data } = await supabase.from('reverify_queue').select('id, wallet_address, face_photo_url, status, created_at').eq('assigned_user_id', parseInt(uid)).eq('status', 'pending').order('created_at', { ascending: true })
          return json({ tasks: data || [], _branding: branding })
        }
        if (req.method === 'POST') {
          // Complete a re-verify task
          const body = await req.json()
          if (!body.task_id || !body.user_id) return json({ error: 'task_id and user_id required' }, 400)

          const { error } = await supabase.from('reverify_queue')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', body.task_id).eq('assigned_user_id', body.user_id)
          if (error) return json({ error: error.message }, 400)

          // Increment reverify_count and sync shared wallet balance
          const { data: userData } = await supabase.from('users').select('reverify_count').eq('id', body.user_id).single()
          const newCount = ((userData as any)?.reverify_count || 0) + 1
          await supabase.from('users').update({ reverify_count: newCount }).eq('id', body.user_id)
          await supabase.rpc('sync_user_shared_balance', { p_user_id: body.user_id })

          return json({ reverify_count: newCount, message: 'Re-verify completed', _branding: branding })
        }
        return json({ error: 'GET or POST required' }, 405)
      }

      // ===== WITHDRAWAL =====
      case 'withdrawal': {
        checkFeature('withdrawal')
        if (req.method !== 'POST') return json({ error: 'POST required' }, 405)
        const body = await req.json()
        if (!body.user_id || !body.method || !body.number || !body.amount) {
          return json({ error: 'user_id, method, number, amount required' }, 400)
        }

        const { data: user } = await supabase.from('users').select('*').eq('id', body.user_id).single()
        if (!user) return json({ error: 'User not found' }, 404)
        if (user.is_blocked) return json({ error: 'Account blocked' }, 403)
        const shared = await getSharedBalance(user)
        if (shared.availableBdt < body.amount) return json({ error: 'Insufficient balance' }, 400)

        const minW = shared.minWithdraw
        if (body.amount < minW) return json({ error: `Minimum withdraw: ${minW} TK` }, 400)

        await supabase.from('transactions').insert({
          user_id: user.id, type: 'withdrawal', amount: body.amount,
          details: `${body.method.toUpperCase()}: ${body.number}`, status: 'pending',
        })
        const { data: newBalance } = await supabase.rpc('sync_user_shared_balance', { p_user_id: user.id })

        return json({ new_balance: newBalance, message: 'Withdrawal requested', _branding: branding })
      }

      // ===== TRANSFER REQUEST =====
      case 'transfer-request': {
        checkFeature('transfer-request')
        if (req.method === 'GET') {
          const guestId = url.searchParams.get('guest_id')
          const type = url.searchParams.get('type') || 'incoming' // incoming or outgoing
          if (!guestId) return json({ error: 'guest_id required' }, 400)

          if (type === 'incoming') {
            const { data } = await supabase.from('user_transfer_requests').select('*').eq('target_guest_id', guestId).eq('status', 'pending').order('created_at', { ascending: false })
            return json({ requests: data || [], _branding: branding })
          } else {
            const { data } = await supabase.from('user_transfer_requests').select('*').eq('requester_guest_id', guestId).order('created_at', { ascending: false })
            return json({ requests: data || [], _branding: branding })
          }
        }
        if (req.method === 'POST') {
          const body = await req.json()
          if (!body.requester_user_id || !body.requester_guest_id || !body.target_guest_id || !body.payment_number) {
            return json({ error: 'requester_user_id, requester_guest_id, target_guest_id, payment_number required' }, 400)
          }

          // Check for existing pending request
          const { data: existing } = await supabase.from('user_transfer_requests').select('id').eq('requester_guest_id', body.requester_guest_id).in('status', ['pending', 'submitted']).limit(1)
          if (existing && existing.length > 0) return json({ error: 'Already has an active request' }, 409)

          const { data: user } = await supabase.from('users').select('key_count').eq('id', body.requester_user_id).single()

          const { error } = await supabase.from('user_transfer_requests').insert({
            requester_user_id: body.requester_user_id,
            requester_guest_id: body.requester_guest_id,
            requester_verified_count: user?.key_count || 0,
            requester_payment_number: body.payment_number,
            requester_payment_method: body.payment_method || null,
            target_guest_id: body.target_guest_id,
          })
          if (error) return json({ error: error.message }, 400)
          return json({ message: 'Transfer request created', _branding: branding })
        }
        return json({ error: 'GET or POST required' }, 405)
      }

      // ===== STORIES =====
      case 'stories': {
        checkFeature('stories')
        if (req.method === 'GET') {
          const userId = url.searchParams.get('user_id')
          let q = supabase.from('stories').select('id, user_id, image_url, music_name, created_at, expires_at').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false })
          if (userId) q = q.eq('user_id', parseInt(userId))
          const { data } = await q.limit(50)
          return json({ stories: data || [], _branding: branding })
        }
        if (req.method === 'POST') {
          const body = await req.json()
          if (!body.user_id || !body.image_url) return json({ error: 'user_id and image_url required' }, 400)
          const { data, error } = await supabase.from('stories').insert({
            user_id: body.user_id, image_url: body.image_url, music_name: body.music_name || null,
          }).select('id, created_at, expires_at').single()
          if (error) return json({ error: error.message }, 400)
          return json({ story: data, message: 'Story created', _branding: branding })
        }
        return json({ error: 'GET or POST required' }, 405)
      }

      // ===== ADMIN PANEL =====
      case 'admin-panel': {
        checkFeature('admin-panel')
        const subAction = url.searchParams.get('action')

        switch (subAction) {
          case 'users': {
            const { data } = await supabase.from('users').select('id, guest_id, display_name, balance, key_count, reverify_count, is_blocked, is_verified_badge, created_at').order('created_at', { ascending: false }).limit(100)
            return json({ users: data || [], _branding: branding })
          }
          case 'all-transactions': {
            const { data } = await supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(100)
            return json({ transactions: data || [], _branding: branding })
          }
          case 'reverify-queue': {
            const { data } = await supabase.from('reverify_queue').select('*').order('created_at', { ascending: false })
            return json({ queue: data || [], _branding: branding })
          }
          case 'bindings': {
            const { data } = await supabase.from('face_wallet_bindings').select('*').order('created_at', { ascending: false })
            return json({ bindings: data || [], _branding: branding })
          }
          case 'submitted-numbers': {
            const { data } = await supabase.from('submitted_numbers').select('*').order('submitted_at', { ascending: false })
            return json({ numbers: data || [], _branding: branding })
          }
          case 'reset-history': {
            const { data } = await supabase.from('reset_history').select('*').order('reset_at', { ascending: false })
            return json({ history: data || [], _branding: branding })
          }
          default:
            return json({
              available_actions: ['users', 'all-transactions', 'reverify-queue', 'bindings', 'submitted-numbers', 'reset-history'],
              usage: 'GET /admin-panel?action=users',
              _branding: branding,
            })
        }
      }

      default:
        return json({
          error: `Unknown action: ${action}`,
          available_actions: [
            'info', 'check-feature', 'settings', 'user-login', 'user-profile',
            'balance-check', 'transactions', 'key-submit', 'wallet-binding',
            'face-verify', 're-verify', 'withdrawal', 'transfer-request',
            'stories', 'admin-panel',
          ],
          _branding: branding,
        }, 404)
    }
  } catch (e: any) {
    if (e.status) return json({ error: e.message, _branding: { sponsor: 'Good-App' } }, e.status)
    return json({ error: e.message || 'Internal error', _branding: { sponsor: 'Good-App' } }, 500)
  }
})

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
