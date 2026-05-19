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
  const grossBdt = Math.floor(spendableAccounts * rewardRate + referralUsdt * usdtToBdt);
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
    bdtWithdrawn,
    grossBdt,
    availableBdt,
    availableUsdt,
  };
}