import { supabase } from "@/integrations/supabase/client";
import { calculateSharedBalance } from "@/lib/balance";

// Types
export type User = {
  id: number;
  guest_id: string;
  display_name: string | null;
  is_verified_badge: boolean;
  balance: number;
  key_count: number;
  is_blocked: boolean;
  payment_status: string;
  payment_scheduled_at: string | null;
  created_at: string | null;
  avatar_url: string | null;
  watched_video_url: string | null;
  email: string | null;
  auth_id: string | null;
  online_at?: string | null;
  request_password?: string | null;
  locked_target_guest_id?: string | null;
  reverify_count?: number;
  usdt_paid_count?: number;
  referral_code?: string | null;
  referred_by_user_id?: number | null;
  referral_usdt_earnings?: number;
  promo_code_used?: string | null;
  promo_owner_user_id?: number | null;
  promo_user_bonus_bdt?: number;
  promo_owner_usdt_earnings?: number;
};

export type Transaction = {
  id: number;
  user_id: number;
  type: string;
  amount: number;
  details: string | null;
  status: string | null;
  created_at: string | null;
};

export type PoolItem = {
  id: number;
  private_key: string;
  verify_url: string;
  is_used: boolean;
  added_by: string;
  created_at: string | null;
};

export type SubmittedNumber = {
  id: number;
  phone_number: string;
  verified_count: number;
  submitted_by: string;
  payment_number: string | null;
  payment_method: string | null;
  submitted_at: string | null;
};

export type ResetHistoryItem = {
  id: number;
  phone_number: string;
  verified_count: number;
  submitted_by: string;
  payment_number: string | null;
  payment_method: string | null;
  reset_at: string | null;
};

export type Settings = {
  rewardRate: number;
  buyStatus: string;
  bonusStatus: string;
  bonusTarget: number;
  customNotice: string;
  videoUrl: string;
  requestSubmitPassword: string;
  minRequestVerified: number;
  minRequestTarget: number;
  paymentMode: string;
  minWithdraw: number;
  withdrawLockUntil: string | null;
  requestLockUntil: string | null;
  appVersion: number;
  rechargeEnabled: string;
  maintenanceMode: string;
  maintenanceNotice: string;
  usdtPayoutEnabled: string;
  usdtRatePerAccount: number;
  usdtMinWithdraw: number;
  usdtFeePercent: number;
  referralBonusUsd: number;
  usdtToBdtRate: number;
  promoUserBonusPct: number;
  promoOwnerCommissionPct: number;
};

// Auth / User APIs
export async function loginUser(guestId: string, displayName: string): Promise<User> {
  // Try to find existing user
  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("guest_id", guestId.trim())
    .single();

  if (existing) {
    if (existing.is_blocked) throw new Error("Account is blocked");
    // Update display name if provided
    if (displayName && displayName !== existing.display_name) {
      await supabase.from("users").update({ display_name: displayName }).eq("id", existing.id);
    }
    return existing;
  }

  // Create new user
  const { data: newUser, error } = await supabase
    .from("users")
    .insert({ guest_id: guestId.trim(), display_name: displayName || null })
    .select()
    .single();

  if (error) throw error;
  return newUser;
}

export async function getUser(userId: number): Promise<User | null> {
  const { data } = await supabase.from("users").select("*").eq("id", userId).single();
  return data;
}

// Settings APIs
export async function getPublicSettings(): Promise<Settings> {
  const { data, error } = await supabase.from("settings").select("*");
  if (error) throw error;

  const settings: Settings = {
    rewardRate: 40,
    buyStatus: "on",
    bonusStatus: "off",
    bonusTarget: 10,
    customNotice: "",
    videoUrl: "",
    requestSubmitPassword: "Anamul-341321",
    minRequestVerified: 10,
    minRequestTarget: 0,
    paymentMode: "off",
    minWithdraw: 50,
    withdrawLockUntil: null,
    requestLockUntil: null,
    appVersion: 0,
    rechargeEnabled: "on",
    maintenanceMode: "off",
    maintenanceNotice: "",
    usdtPayoutEnabled: "off",
    usdtRatePerAccount: 0.05,
    usdtMinWithdraw: 0.5,
    usdtFeePercent: 2,
    referralBonusUsd: 0.05,
    usdtToBdtRate: 124,
    promoUserBonusPct: 5,
    promoOwnerCommissionPct: 5,
  };

  data?.forEach((s) => {
    if (s.key === "rewardRate") settings.rewardRate = parseInt(s.value) || settings.rewardRate;
    if (s.key === "buyStatus") settings.buyStatus = s.value;
    if (s.key === "bonusStatus") settings.bonusStatus = s.value;
    if (s.key === "bonusTarget") settings.bonusTarget = parseInt(s.value) || settings.bonusTarget;
    if (s.key === "customNotice") settings.customNotice = s.value;
    if (s.key === "videoUrl") settings.videoUrl = s.value;
    if (s.key === "requestSubmitPassword") settings.requestSubmitPassword = s.value;
    if (s.key === "minRequestVerified") settings.minRequestVerified = parseInt(s.value) || 10;
    if (s.key === "minRequestTarget") settings.minRequestTarget = parseInt(s.value) || 0;
    if (s.key === "paymentMode") settings.paymentMode = s.value;
    if (s.key === "minWithdraw") settings.minWithdraw = parseInt(s.value) || 50;
    if (s.key === "withdrawLockUntil") settings.withdrawLockUntil = s.value || null;
    if (s.key === "requestLockUntil") settings.requestLockUntil = s.value || null;
    if (s.key === "appVersion") settings.appVersion = parseInt(s.value) || 0;
    if (s.key === "rechargeEnabled") settings.rechargeEnabled = s.value || "on";
    if (s.key === "maintenanceMode") settings.maintenanceMode = s.value || "off";
    if (s.key === "maintenanceNotice") settings.maintenanceNotice = s.value || "";
    if (s.key === "usdtPayoutEnabled") settings.usdtPayoutEnabled = s.value || "off";
    if (s.key === "usdtMinWithdraw") settings.usdtMinWithdraw = parseFloat(s.value) || 0.5;
    if (s.key === "usdtFeePercent") settings.usdtFeePercent = parseFloat(s.value) || 2;
    if (s.key === "referralBonusUsd") settings.referralBonusUsd = parseFloat(s.value) || 0.05;
    if (s.key === "usdtToBdtRate") settings.usdtToBdtRate = parseFloat(s.value) || 124;
    if (s.key === "promoUserBonusPct") settings.promoUserBonusPct = parseFloat(s.value) || 5;
    if (s.key === "promoOwnerCommissionPct") settings.promoOwnerCommissionPct = parseFloat(s.value) || 5;
  });

  // Auto-derive USDT rate per account from BDT reward rate ÷ USDT→BDT rate
  settings.usdtRatePerAccount = +(settings.rewardRate / settings.usdtToBdtRate).toFixed(6);

  return settings;
}

// USDT auto-payout (Base network)
export async function requestUsdtPayout(userId: number, recipient: string, amount: number) {
  const { data, error } = await supabase.functions.invoke("usdt-payout", {
    body: { user_id: userId, recipient, amount },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as { success: boolean; tx_hash: string; received: number; fee: number; new_balance: number };
}

// Referral system
export async function applyReferralCode(userId: number, code: string): Promise<void> {
  const cleaned = code.trim().toUpperCase();
  if (!cleaned) throw new Error("Reffer code dorkar");
  // Make sure user is not yet referred and code is valid + not self
  const me = await getUser(userId);
  if (!me) throw new Error("User not found");
  if (me.referred_by_user_id) throw new Error("Apni agei reffer code use korechen");
  if (me.referral_code === cleaned) throw new Error("Nijer code use kora jabe na");
  const { data: referrer } = await supabase
    .from("users")
    .select("id, referral_code")
    .eq("referral_code", cleaned)
    .maybeSingle();
  if (!referrer) throw new Error("Reffer code thik na");
  if (referrer.id === userId) throw new Error("Nijer code use kora jabe na");
  // Snapshot the referee's current reverify_count at the moment of applying the code,
  // so the referrer only gets credit for re-verifies done AFTER this point.
  const currentReverify = Number((me as any).reverify_count || 0);
  const { error } = await supabase
    .from("users")
    .update({
      referred_by_user_id: referrer.id,
      reverify_count_at_referral: currentReverify,
    } as any)
    .eq("id", userId);
  if (error) throw error;
}

export async function getReferralStats(userId: number): Promise<{ count: number; verifiedAccounts: number }> {
  const { data } = await supabase
    .from("users")
    .select("id, reverify_count, reverify_count_at_referral")
    .eq("referred_by_user_id", userId);
  const list = data || [];
  // Only count re-verifies done AFTER the referral code was applied (delta from snapshot).
  const verifiedAccounts = list.reduce((sum: number, u: any) => {
    const delta = Number(u.reverify_count || 0) - Number(u.reverify_count_at_referral || 0);
    return sum + Math.max(0, delta);
  }, 0);
  return { count: list.length, verifiedAccounts };
}

export async function updateSetting(key: string, value: string) {
  const { data: existingRows, error: existingError } = await supabase
    .from("settings")
    .select("id")
    .eq("key", key)
    .limit(1);

  if (existingError) throw existingError;

  if (existingRows && existingRows.length > 0) {
    const { error } = await supabase.from("settings").update({ value }).eq("key", key);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("settings").insert({ key, value });
  if (error) throw error;
}

// Transactions
export async function getUserTransactions(userId: number): Promise<Transaction[]> {
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  return data || [];
}

export async function createTransaction(tx: {
  user_id: number;
  type: string;
  amount: number;
  details?: string;
  status?: string;
}) {
  await supabase.from("transactions").insert(tx);
}

// Key operations
export async function submitKey(userId: number, privateKey: string): Promise<{ newBalance: number; message: string }> {
  // No duplicate check needed — keys are auto-generated fresh every time
  // Verified = instant submit, not verified = cancelled & new key generated

  // Get reward rate
  const settings = await getPublicSettings();
  const rewardRate = settings.rewardRate;

  // Get current user
  const user = await getUser(userId);
  if (!user) throw new Error("User not found");
  if (user.is_blocked) throw new Error("Account blocked");

  // Increment key count only — balance is earned only through re-verify
  const newKeyCount = user.key_count + 1;
  
  await supabase.from("users").update({
    key_count: newKeyCount,
  }).eq("id", userId);

  // Create transaction record (count only, no TK)
  await createTransaction({
    user_id: userId,
    type: "earning",
    amount: 0,
    details: `ভেরিফাইড কী #${newKeyCount}`,
    status: "completed",
  });

  return { newBalance: user.balance, message: `ভেরিফাইড! মোট কাউন্ট: ${newKeyCount}` };
}

// Withdraw
export async function requestWithdraw(userId: number, method: string, number: string, amount: number) {
  const user = await getUser(userId);
  if (!user) throw new Error("User not found");
  if (user.is_blocked) throw new Error("Account blocked");
  const settings = await getPublicSettings();
  const { data: txs } = await supabase
    .from("transactions")
    .select("amount,type,status")
    .eq("user_id", userId);
  const sharedBalance = calculateSharedBalance(user, settings, (txs || []) as Transaction[]);
  if (sharedBalance.availableBdt < amount) throw new Error("Insufficient balance");
  const minW = settings.minWithdraw || 50;
  if (amount < minW) throw new Error(`সর্বনিম্ন উইথড্র ${minW} TK`);

  const fee = amount < 100 ? 20 : 10;
  const receive = amount - fee;
  if (receive <= 0) throw new Error("ফি কাটার পর পরিমাণ ০ এর কম");

  await createTransaction({
    user_id: userId,
    type: "withdrawal",
    amount,
    details: `${method.toUpperCase()}: ${number} · ফি ৳${fee} · পাবেন ৳${receive}`,
    status: "pending",
  });
  await supabase.from("users").update({ balance: sharedBalance.availableBdt - amount }).eq("id", userId);

  return { newBalance: sharedBalance.availableBdt - amount };
}

// Pool
export async function getPoolStats(): Promise<PoolItem[]> {
  // Fetch all keys (bypass 1000 row default limit) - exclude private_key for security
  let allData: PoolItem[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data } = await supabase
      .from("verification_pool")
      .select("id, verify_url, is_used, added_by, created_at")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (!data || data.length === 0) break;
    allData = allData.concat(data.map(d => ({ ...d, private_key: "***" })) as PoolItem[]);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allData;
}

export async function addPoolKey(privateKey: string, verifyUrl: string, addedBy: string) {
  await supabase.from("verification_pool").insert({ private_key: privateKey, verify_url: verifyUrl, added_by: addedBy });
}

export async function getReadyKey(): Promise<PoolItem | null> {
  const { data } = await supabase
    .from("verification_pool")
    .select("*")
    .eq("is_used", false)
    .limit(1)
    .single();
  return data;
}

export async function markKeyUsed(keyId: number) {
  await supabase.from("verification_pool").update({ is_used: true }).eq("id", keyId);
}

export async function deletePoolKey(keyId: number) {
  await supabase.from("verification_pool").delete().eq("id", keyId);
}

export async function deleteUsedKeys() {
  await supabase.from("verification_pool").delete().eq("is_used", true);
}

export async function deleteAllPoolKeys() {
  await supabase.from("verification_pool").delete().neq("id", 0);
}

// Admin
export async function getAllUsers(): Promise<User[]> {
  const pageSize = 1000;
  let from = 0;
  let allUsers: User[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allUsers = allUsers.concat(data);
    if (data.length < pageSize) break;

    from += pageSize;
  }

  return allUsers;
}

export async function toggleBlockUser(userId: number, isBlocked: boolean) {
  await supabase.from("users").update({ is_blocked: isBlocked }).eq("id", userId);
}

export async function updateUserVerifiedBadge(userId: number, isVerifiedBadge: boolean) {
  await supabase.from("users").update({ is_verified_badge: isVerifiedBadge }).eq("id", userId);
}

export async function updateUserBalance(userId: number, balance: number) {
  await supabase.from("users").update({ balance }).eq("id", userId);
}

export async function resetUserKeyCount(userId: number) {
  await supabase.from("users").update({ key_count: 0 }).eq("id", userId);
}

export async function updateUserKeyCount(userId: number, keyCount: number) {
  // Get current user data for history logging
  const { data: userData } = await supabase.from("users").select("key_count, guest_id").eq("id", userId).single();
  const oldCount = (userData as any)?.key_count || 0;
  const guestId = (userData as any)?.guest_id || String(userId);

  const { error } = await supabase.from("users").update({ key_count: keyCount }).eq("id", userId);
  if (error) throw error;

  // Log the change in reset_history if count was reduced
  const diff = oldCount - keyCount;
  if (diff > 0) {
    await supabase.from("reset_history").insert({
      phone_number: guestId,
      verified_count: diff,
      submitted_by: "Admin (Manual Edit)",
    });
  }
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const { data } = await supabase.from("transactions").select("*").order("created_at", { ascending: false });
  return data || [];
}

export async function updateTransactionStatus(txId: number, status: string) {
  // Get the transaction first
  const { data: tx } = await supabase.from("transactions").select("*").eq("id", txId).single();
  if (!tx) throw new Error("Transaction not found");

  await supabase.from("transactions").update({ status }).eq("id", txId);

  // Balance is now synced by the database trigger from the shared earning pool.
  // Do not manually add/refund here, otherwise rejected withdrawals can double-refund.
  await (supabase as any).rpc("sync_user_shared_balance", { p_user_id: tx.user_id });
}

export async function updateUserPaymentStatus(userId: number, status: string) {
  await supabase.from("users").update({ payment_status: status }).eq("id", userId);
}

// Submitted numbers
export async function getSubmittedNumbers(): Promise<SubmittedNumber[]> {
  const { data } = await supabase.from("submitted_numbers").select("*").order("submitted_at", { ascending: false });
  return data || [];
}

export async function addSubmittedNumbers(numbers: string[], submittedBy: string, paymentNumber?: string, paymentMethod?: string) {
  const items = numbers.map(n => ({
    phone_number: n,
    submitted_by: submittedBy,
    payment_number: paymentNumber || null,
    payment_method: paymentMethod || null,
  }));
  await supabase.from("submitted_numbers").insert(items);
}

export async function deleteSubmittedNumber(id: number) {
  await supabase.from("submitted_numbers").delete().eq("id", id);
}

export async function clearAllSubmittedNumbers() {
  await supabase.from("submitted_numbers").delete().neq("id", 0);
}

export async function getExistingPhoneNumbers(): Promise<string[]> {
  const { data } = await supabase.from("submitted_numbers").select("phone_number");
  return data?.map(d => d.phone_number) || [];
}

// Reset history
export async function getResetHistory(): Promise<ResetHistoryItem[]> {
  const { data } = await supabase.from("reset_history").select("*").order("reset_at", { ascending: false });
  return data || [];
}

export async function addResetHistory(phoneNumber: string, verifiedCount: number, submittedBy: string, paymentNumber?: string, paymentMethod?: string) {
  await supabase.from("reset_history").insert({
    phone_number: phoneNumber,
    verified_count: verifiedCount,
    submitted_by: submittedBy,
    payment_number: paymentNumber || null,
    payment_method: paymentMethod || null,
  });
}

// Payment lists
export async function getPaymentUsers(status: string): Promise<User[]> {
  const { data } = await supabase.from("users").select("*").eq("payment_status", status);
  return data || [];
}

// Update user watched video URL
export async function updateUserWatchedVideo(userId: number, videoUrl: string) {
  await supabase.from("users").update({ watched_video_url: videoUrl }).eq("id", userId);
}

// Get duplicate key attempts
export async function getDuplicateKeyAttempts(): Promise<{
  user_id: number;
  guest_id: string;
  display_name: string | null;
  details: string;
  created_at: string | null;
}[]> {
  const { data: attempts } = await supabase
    .from("transactions")
    .select("user_id, details, created_at")
    .eq("type", "duplicate_attempt")
    .order("created_at", { ascending: false });

  if (!attempts || attempts.length === 0) return [];

  // Get user info for each
  const userIds = [...new Set(attempts.map(a => a.user_id))];
  const { data: usersData } = await supabase
    .from("users")
    .select("id, guest_id, display_name")
    .in("id", userIds);

  const userMap = new Map(usersData?.map(u => [u.id, u]) || []);
  
  return attempts.map(a => ({
    user_id: a.user_id,
    guest_id: userMap.get(a.user_id)?.guest_id || "Unknown",
    display_name: userMap.get(a.user_id)?.display_name || null,
    details: a.details || "",
    created_at: a.created_at,
  }));
}

// Recalculate all users' balance based on key_count * rate (uses DB function for speed)
export async function recalculateAllBalances(rate: number) {
  const { error } = await supabase.rpc("recalculate_all_balances", { p_rate: rate });
  if (error) throw error;
}

// Reset all users' balance to 0 when paymentMode is turned off
export async function resetAllBalances() {
  const { error } = await (supabase as any).rpc("recalculate_all_balances", { p_rate: null });
  if (error) throw error;
}

// Reset all users' verified count to 0 and log to reset_history
// Returns { batchId, count }
export async function resetAllVerifiedCounts(): Promise<{ batchId: string; count: number }> {
  const { data, error } = await supabase.rpc("reset_all_verified_counts", {
    p_admin_name: "Admin",
  } as any);
  if (error) throw error;
  const result = String(data || "");
  const [batchId, countStr] = result.split(":");
  return { batchId, count: Number(countStr || 0) };
}

// Undo last verified count reset by batch ID
export async function undoLastVerifiedReset(batchId: string): Promise<number> {
  const { data, error } = await supabase.rpc("undo_last_verified_reset", {
    p_batch_id: batchId,
  } as any);
  if (error) throw error;
  return Number(data || 0);
}

// Reset all users' reverify count to 0 and log to reset_history
export async function resetAllReverifyCounts(): Promise<number> {
  const { data, error } = await supabase.rpc("reset_all_reverify_counts", {
    p_admin_name: "Admin",
  } as any);
  if (error) throw error;
  return Number(data || 0);
}

// Reset single user's reverify count
export async function resetUserReverifyCount(userId: number) {
  await supabase.from("users").update({ reverify_count: 0 }).eq("id", userId);
}

// ─── Promo Code APIs ────────────────────────────────────────────
export type PromoCode = {
  id: string;
  code: string;
  owner_user_id: number;
  is_active: boolean;
  total_uses: number;
  total_earned_usdt: number;
  created_at: string;
  owner_display_name?: string | null;
  owner_guest_id?: string | null;
};

export async function listPromoCodes(): Promise<PromoCode[]> {
  const { data, error } = await (supabase as any)
    .from("promo_codes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const codes = (data || []) as PromoCode[];
  if (codes.length === 0) return codes;
  const ownerIds = Array.from(new Set(codes.map((c) => c.owner_user_id)));
  const { data: owners } = await supabase
    .from("users")
    .select("id, display_name, guest_id")
    .in("id", ownerIds);
  const map = new Map<number, any>((owners || []).map((o: any) => [o.id, o]));
  return codes.map((c) => ({
    ...c,
    owner_display_name: map.get(c.owner_user_id)?.display_name ?? null,
    owner_guest_id: map.get(c.owner_user_id)?.guest_id ?? null,
  }));
}

export async function createPromoCode(code: string, ownerGuestId: string): Promise<PromoCode> {
  const cleanedCode = code.trim().toUpperCase();
  const cleanedGuest = ownerGuestId.trim();
  if (!cleanedCode || cleanedCode.length < 3) throw new Error("Code minimum 3 character hote hobe");
  if (!cleanedGuest) throw new Error("Owner UID/phone dorkar");

  const { data: owner, error: ownerErr } = await supabase
    .from("users")
    .select("id, guest_id, display_name")
    .eq("guest_id", cleanedGuest)
    .maybeSingle();
  if (ownerErr) throw ownerErr;
  if (!owner) throw new Error("Owner user khuje pawa jaini");

  const { data, error } = await (supabase as any)
    .from("promo_codes")
    .insert({ code: cleanedCode, owner_user_id: owner.id })
    .select()
    .single();
  if (error) {
    if (String(error.message || "").toLowerCase().includes("duplicate")) {
      throw new Error("Ei code agei exists");
    }
    throw error;
  }
  return { ...data, owner_display_name: owner.display_name, owner_guest_id: owner.guest_id };
}

export async function togglePromoCode(id: string, isActive: boolean) {
  const { error } = await (supabase as any)
    .from("promo_codes")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw error;
}

export async function deletePromoCode(id: string) {
  const { error } = await (supabase as any).from("promo_codes").delete().eq("id", id);
  if (error) throw error;
}
