import type { Settings, Transaction, User } from "@/lib/api";

type BalanceUser = Pick<User, "reverify_count" | "usdt_paid_count" | "referral_usdt_earnings"> | null | undefined;
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
  const bdtWithdrawn = getActiveBdtWithdrawalTotal(transactions);
  // Bonus: every full group of 10 spendable accounts → +10 TK per account = +100 TK per group
  const bonusGroups = Math.floor(spendableAccounts / 10);
  const bonusBdt = bonusGroups * 100;
  const accountsToNextBonus = bonusGroups * 10 + 10 - spendableAccounts;
  const grossBdt = Math.floor(spendableAccounts * rewardRate + bonusBdt + referralUsdt * usdtToBdt);
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
    bonusGroups,
    bonusBdt,
    accountsToNextBonus,
    bdtWithdrawn,
    grossBdt,
    availableBdt,
    availableUsdt,
  };
}