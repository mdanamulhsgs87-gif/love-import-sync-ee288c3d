import { useQuery } from "@tanstack/react-query";
import { getUserTransactions, getUser, getPublicSettings } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { ArrowUpRight, History, CheckCircle2, Clock, XCircle, ShieldCheck, Hourglass, Sparkles, TrendingUp, RefreshCcw, Wallet, Coins } from "lucide-react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { calculateSharedBalance } from "@/lib/balance";

export function TransactionList() {
  const { user } = useAuth();
  const { data: transactions, isLoading } = useQuery({
    queryKey: ["transactions", user?.id],
    queryFn: () => getUserTransactions(user!.id),
    enabled: !!user,
  });
  const { data: dbUser } = useQuery({
    queryKey: ["me-balance", user?.id],
    queryFn: () => getUser(user!.id),
    enabled: !!user,
    refetchInterval: 8000,
  });
  const { data: settings } = useQuery({
    queryKey: ["public-settings"],
    queryFn: getPublicSettings,
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="glass-card rounded-3xl p-8 text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          className="w-10 h-10 mx-auto mb-3 border-4 border-primary/30 border-t-primary rounded-full"
        />
        <p className="text-muted-foreground text-sm font-bold animate-pulse">ইতিহাস লোড হচ্ছে...</p>
      </div>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <div className="relative glass-card rounded-3xl p-10 text-center overflow-hidden border border-border/40">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--purple))]/5 via-transparent to-[hsl(var(--cyan))]/5" />
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 2.5, repeat: Infinity }}
          className="relative w-20 h-20 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-[hsl(var(--purple))]/20 to-[hsl(var(--cyan))]/20 flex items-center justify-center border border-border/50"
        >
          <History className="w-10 h-10 text-muted-foreground opacity-60" />
        </motion.div>
        <p className="relative text-sm font-bold text-foreground/70">এখনো কোনো লেনদেন হয়নি</p>
        <p className="relative text-[11px] text-muted-foreground mt-1">Re-verify করলে আয় এখানে দেখাবে</p>
      </div>
    );
  }

  // Categorize properly
  const isFirstVerifyEarning = (t: any) =>
    t.type === "earning" && (
      (Number(t.amount) || 0) === 0 ||
      (typeof t.details === "string" && (t.details.startsWith("Verified wallet") || t.details.includes("১ম ভেরিফাই")))
    );
  const isReverifyEarning = (t: any) =>
    t.type === "earning" && !isFirstVerifyEarning(t);
  const isUsdtPayout = (t: any) => t.type === "usdt_payout";
  const isWithdrawal = (t: any) => t.type === "withdrawal" || (t.type !== "earning" && !isUsdtPayout(t));

  // Hide 1st-verify ৳1 entries from the visible list
  const visible = transactions.filter((t: any) => !isFirstVerifyEarning(t));

  const reverifyCompleted = visible.filter((t: any) => isReverifyEarning(t) && t.status !== "pending" && t.status !== "rejected");
  const usdtPayouts = visible.filter(isUsdtPayout);
  const withdrawalsList = visible.filter(isWithdrawal);
  // True total earned = current balance + all non-rejected withdrawals.
  // This matches reality even if reward-rate changed historically.
  const withdrawnSum = withdrawalsList
    .filter((t: any) => t.status !== "rejected")
    .reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);
  const currentBalance = calculateSharedBalance(dbUser, settings, transactions as any[]).availableBdt;
  const totalEarned = currentBalance + withdrawnSum;
  const totalUsdt = usdtPayouts.reduce((s: number, t: any) => s + (Number(t.amount) || 0) / 100, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="space-y-3"
    >
      {/* Premium header card with summary */}
      <div className="relative rounded-3xl p-[1.5px] overflow-hidden shadow-[0_12px_40px_-12px_hsl(var(--purple)/0.5)]">
        <motion.div
          className="absolute inset-0 rounded-3xl"
          style={{ background: "conic-gradient(from 0deg, hsl(var(--purple)), hsl(var(--cyan)), hsl(var(--emerald)), hsl(var(--amber)), hsl(var(--purple)))" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
        />
        <div className="relative rounded-[22px] glass-card overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--purple))]/10 via-transparent to-[hsl(var(--cyan))]/10" />
          <div className="relative z-10 p-5">
            <div className="flex items-center gap-3 mb-4">
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[hsl(var(--purple))] to-[hsl(var(--cyan))] flex items-center justify-center shadow-lg shadow-[hsl(var(--purple))]/30"
              >
                <History className="w-5 h-5 text-white" />
              </motion.div>
              <div>
                <h3 className="text-base font-black bg-gradient-to-r from-[hsl(var(--purple))] via-[hsl(var(--cyan))] to-[hsl(var(--emerald))] bg-clip-text text-transparent"
                  style={{ backgroundSize: "200% auto", animation: "shimmer-text 3s linear infinite" }}>
                  📜 আমার ইতিহাস
                </h3>
                <p className="text-[10px] text-muted-foreground font-semibold">আয়, পেমেন্ট ও রি-ভেরিফাই</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="relative rounded-2xl p-3 bg-gradient-to-br from-[hsl(var(--emerald))]/20 to-[hsl(var(--cyan))]/10 border border-[hsl(var(--emerald))]/40 overflow-hidden">
                <div className="flex items-center gap-1 mb-1">
                  <TrendingUp className="w-3 h-3 text-[hsl(var(--emerald))]" />
                  <p className="text-[9px] font-black text-[hsl(var(--emerald))] uppercase">মোট আয়</p>
                </div>
                <p className="text-xl font-black text-[hsl(var(--emerald))] leading-none drop-shadow-[0_0_6px_hsl(var(--emerald)/0.5)]">
                  ৳{totalEarned}
                </p>
                <p className="text-[8px] text-muted-foreground/80 mt-1 font-semibold leading-tight">
                  Balance ৳{currentBalance} + উইথড্র ৳{withdrawnSum}
                </p>
              </div>
              <div className="relative rounded-2xl p-3 bg-gradient-to-br from-[hsl(var(--amber))]/20 to-[hsl(var(--orange))]/10 border border-[hsl(var(--amber))]/40 overflow-hidden">
                <div className="flex items-center gap-1 mb-1">
                  <Coins className="w-3 h-3 text-[hsl(var(--amber))]" />
                  <p className="text-[9px] font-black text-[hsl(var(--amber))] uppercase">USDT</p>
                </div>
                <p className="text-xl font-black text-[hsl(var(--amber))] leading-none drop-shadow-[0_0_6px_hsl(var(--amber)/0.5)]">
                  {totalUsdt.toFixed(2)}
                </p>
              </div>
              <div className="relative rounded-2xl p-3 bg-gradient-to-br from-[hsl(var(--pink))]/20 to-[hsl(var(--purple))]/10 border border-[hsl(var(--pink))]/40 overflow-hidden">
                <div className="flex items-center gap-1 mb-1">
                  <Wallet className="w-3 h-3 text-[hsl(var(--pink))]" />
                  <p className="text-[9px] font-black text-[hsl(var(--pink))] uppercase">উইথড্র</p>
                </div>
                <p className="text-xl font-black text-[hsl(var(--pink))] leading-none drop-shadow-[0_0_6px_hsl(var(--pink)/0.5)]">
                  {withdrawalsList.length + usdtPayouts.length}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline list */}
      <div className="glass-card rounded-3xl overflow-hidden border border-border/40">
        <div className="divide-y divide-border/30 max-h-[480px] overflow-y-auto">
          {visible.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-xs text-muted-foreground font-bold">এখনো কোনো লেনদেন নেই</p>
              <p className="text-[10px] text-muted-foreground/70 mt-1">Re-verify বা USDT পেমেন্ট হলে এখানে দেখাবে</p>
            </div>
          )}
          {visible.map((tx: any, idx: number) => {
            const isPending = tx.status === "pending";
            const isRejected = tx.status === "rejected";
            const isReverify = isReverifyEarning(tx);
            const isUsdt = isUsdtPayout(tx);
            const isCompleted = isReverify && !isPending && !isRejected;

            const barColor = isRejected
              ? "hsl(var(--destructive))"
              : isUsdt
              ? "hsl(var(--amber))"
              : isCompleted
              ? "hsl(var(--emerald))"
              : "hsl(var(--pink))";

            return (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(idx * 0.04, 0.4) }}
                className="relative p-4 hover:bg-secondary/20 transition-all group overflow-hidden"
              >
                <div
                  className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full opacity-80"
                  style={{ background: barColor, boxShadow: `0 0 8px ${barColor}` }}
                />
                {isCompleted && (
                  <motion.div
                    className="absolute top-3 right-3"
                    animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Sparkles className="w-3 h-3 text-[hsl(var(--emerald))]" />
                  </motion.div>
                )}

                <div className="flex items-center justify-between gap-3 pl-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: 8 }}
                      className={`relative w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden ${
                        isRejected
                          ? "bg-gradient-to-br from-destructive/30 to-destructive/10 text-destructive border border-destructive/40"
                          : isUsdt
                          ? "bg-gradient-to-br from-[hsl(var(--amber))]/30 to-[hsl(var(--orange))]/15 text-[hsl(var(--amber))] border border-[hsl(var(--amber))]/40 shadow-[0_0_15px_-3px_hsl(var(--amber)/0.5)]"
                          : isCompleted
                          ? "bg-gradient-to-br from-[hsl(var(--emerald))]/30 to-[hsl(var(--cyan))]/15 text-[hsl(var(--emerald))] border border-[hsl(var(--emerald))]/40 shadow-[0_0_15px_-3px_hsl(var(--emerald)/0.5)]"
                          : "bg-gradient-to-br from-[hsl(var(--pink))]/30 to-[hsl(var(--purple))]/15 text-[hsl(var(--pink))] border border-[hsl(var(--pink))]/40"
                      }`}
                    >
                      {isUsdt && (
                        <motion.div
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-[hsl(var(--amber))]/30 to-transparent"
                          animate={{ x: ["-100%", "200%"] }}
                          transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                        />
                      )}
                      {isUsdt ? (
                        <Coins className="w-5 h-5 relative z-10" />
                      ) : isCompleted ? (
                        <ShieldCheck className="w-5 h-5 relative z-10" />
                      ) : isRejected ? (
                        <XCircle className="w-5 h-5 relative z-10" />
                      ) : (
                        <ArrowUpRight className="w-5 h-5 relative z-10" />
                      )}
                    </motion.div>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-[13px] truncate">
                        {isUsdt
                          ? "💎 USDT পেমেন্ট"
                          : isCompleted
                          ? "✨ Re-verify সফল"
                          : isReverify
                          ? "Re-verify আয়"
                          : `উইথড্র${tx.details ? `: ${tx.details}` : ""}`}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate font-medium">
                        {isUsdt
                          ? (tx.details || "USDT পাঠানো হয়েছে")
                          : isCompleted
                          ? "Balance যোগ হয়েছে"
                          : isRejected
                          ? "বাতিল করা হয়েছে"
                          : isReverify
                          ? "আয় যোগ হয়েছে"
                          : "পেমেন্ট প্রসেসিং"}
                      </p>
                      <p className="text-[9px] text-muted-foreground/70 mt-0.5 font-mono">
                        {format(new Date(tx.created_at || Date.now()), "MMM d, yyyy · h:mm a")}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {isUsdt ? (
                      <p className="font-black text-[hsl(var(--amber))] text-base drop-shadow-[0_0_4px_hsl(var(--amber)/0.5)]">
                        -{(Number(tx.amount) / 100).toFixed(2)} <span className="text-[10px]">USDT</span>
                      </p>
                    ) : isCompleted ? (
                      <p className="font-black text-[hsl(var(--emerald))] text-base drop-shadow-[0_0_4px_hsl(var(--emerald)/0.5)]">
                        +৳{tx.amount}
                      </p>
                    ) : isReverify ? (
                      <p className="font-black text-primary text-base">+৳{tx.amount}</p>
                    ) : (
                      <p className={`font-black text-base ${isRejected ? "text-destructive line-through" : "text-[hsl(var(--pink))]"}`}>
                        -৳{tx.amount}
                      </p>
                    )}
                    <div className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
                      isPending
                        ? "bg-[hsl(var(--amber))]/15 border-[hsl(var(--amber))]/40 text-[hsl(var(--amber))]"
                        : isRejected
                        ? "bg-destructive/15 border-destructive/40 text-destructive"
                        : "bg-[hsl(var(--emerald))]/15 border-[hsl(var(--emerald))]/40 text-[hsl(var(--emerald))]"
                    }`}>
                      {isPending ? (
                        <><Clock className="w-2.5 h-2.5" /><span className="text-[9px] font-black uppercase">Pending</span></>
                      ) : isRejected ? (
                        <><XCircle className="w-2.5 h-2.5" /><span className="text-[9px] font-black uppercase">Rejected</span></>
                      ) : (
                        <><CheckCircle2 className="w-2.5 h-2.5" /><span className="text-[9px] font-black uppercase">Complete</span></>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}