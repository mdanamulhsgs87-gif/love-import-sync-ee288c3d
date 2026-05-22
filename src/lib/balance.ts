import type { Settings, Transaction, User } from "@/lib/api";

type BalanceUser = Pick<User, "reverify_count" | "usdt_paid_count" | "referral_usdt_earnings" | "promo_user_bonus_bdt" | "promo_owner_usdt_earnings"> | null | undefined;
type BalanceTx = Pick<Transaction, "type" | "amount" | "status">;

const activeSpendStatuses = new Set(["pending", "processing", "completed"]);

export function getActiveBdtWithdrawalTotal(transactions: BalanceTx[] = []) {
  return transactions
    .filter((tx) => (tx.type === "withdrawal" || tx.type === "recharge") && activeSpendStatuses.has(tx.status || "completed"))
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
}

export function calculateSharedBalance(user: BalanceUser, settings?: Settings | null, transactions: BalanceTx[] = []) {
  const rewardRate = Number(settings?.rewardRate || 40);
  const usdtToBdt = Number(settings?.usdtToBdtRate || 124);
  const usdtRate = +(rewardRate / usdtToBdt).toFixed(6);
  const completedAccounts = Number(user?.reverify_count || 0);
  const usdtPaidCount = Number(user?.usdt_paid_count || 0);
  const spendableAccounts = Math.max(0, completedAccounts - usdtPaidCount);
  const referralUsdt = Number(user?.referral_usdt_earnings || 0);
  const promoUserBdt = Number(user?.promo_user_bonus_bdt || 0);
  const promoOwnerUsdt = Number(user?.promo_owner_usdt_earnings || 0);
  const bdtWithdrawn = getActiveBdtWithdrawalTotal(transactions);
  // Bonus: percentage tier based on remaining (un-withdrawn) accounts. Resets after withdraw.
  //  >=20 accounts → 20%, >=10 accounts → 10%, else 0%. Gated by admin bonusStatus switch.
  const bonusEnabled = (settings as any)?.bonusStatus === "on";
  const bdtAccountsUsed = rewardRate > 0 ? Math.floor(bdtWithdrawn / rewardRate) : 0;
  const remainingAccounts = Math.max(0, spendableAccounts - bdtAccountsUsed);
  let bonusPercent = 0;
  if (bonusEnabled) {
    if (remainingAccounts >= 20) bonusPercent = 20;
    else if (remainingAccounts >= 10) bonusPercent = 10;
  }
  const bonusBdt = Math.floor((remainingAccounts * rewardRate * bonusPercent) / 100);
  const nextTierAt = bonusEnabled ? (remainingAccounts >= 20 ? 20 : remainingAccounts >= 10 ? 20 : 10) : 10;
  const nextTierPercent = remainingAccounts >= 10 ? 20 : 10;
  const accountsToNextTier = Math.max(0, nextTierAt - remainingAccounts);
  const grossBdt = Math.floor(
    spendableAccounts * rewardRate
    + bonusBdt
    + referralUsdt * usdtToBdt
    + promoUserBdt
    + promoOwnerUsdt * usdtToBdt
  );
  const availableBdt = Math.max(0, grossBdt - bdtWithdrawn);
  const availableUsdt = +(availableBdt / usdtToBdt).toFixed(6);

  return {
    rewardRate,
    usdtToBdt,
    usdtRate,
    completedAccounts,
    usdtPaidCount,
    spendableAccounts,
    referralUsdt,
    promoUserBdt,
    promoOwnerUsdt,
    bonusEnabled,
    bonusPercent,
    remainingAccounts,
    nextTierAt,
    nextTierPercent,
    accountsToNextTier,
    bonusBdt,
    bdtWithdrawn,
    grossBdt,
    availableBdt,
    availableUsdt,
  };
}