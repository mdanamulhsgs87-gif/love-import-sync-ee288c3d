import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requestWithdraw, getPublicSettings, requestUsdtPayout, getUser } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CreditCard, Zap, Clock, AlertTriangle } from "lucide-react";

const TetherLogo = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="16" fill="#26A17B" />
    <path
      fill="#fff"
      d="M17.92 17.39v-.01c-.11.01-.66.04-1.91.04-1 0-1.7-.03-1.95-.04v.01c-3.84-.17-6.71-.84-6.71-1.64s2.87-1.47 6.71-1.64v2.61c.25.02.97.06 1.96.06 1.19 0 1.78-.05 1.9-.06v-2.61c3.83.17 6.69.84 6.69 1.64s-2.86 1.47-6.69 1.64m0-3.55v-2.34h5.36V7.93H8.73v3.57h5.36v2.34c-4.36.2-7.64 1.07-7.64 2.1s3.28 1.9 7.64 2.1v7.5h3.83v-7.5c4.35-.2 7.62-1.06 7.62-2.1s-3.27-1.9-7.62-2.1"
    />
  </svg>
);

// Strip trailing zeros: 0.2000 → 0.2, 1.5000 → 1.5, 0 → 0
const fmtUsdt = (n: number) => {
  if (!isFinite(n)) return "0";
  const s = n.toFixed(6);
  return s.replace(/\.?0+$/, "") || "0";
};
import { motion } from "framer-motion";
import { formatCountdown, getRemainingMilliseconds } from "@/lib/countdown";

export function WithdrawForm({ balance, onSystemChange }: { balance: number; onSystemChange?: (s: "bdt" | "usdt") => void }) {
  const [system, setSystem] = useState<"bdt" | "usdt">("bdt");
  const [method, setMethod] = useState<"bkash" | "nagad">("bkash");
  const [number, setNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [usdtAddress, setUsdtAddress] = useState("");
  const [usdtAmount, setUsdtAmount] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [nowMs, setNowMs] = useState(Date.now());

  const { data: publicSettings } = useQuery({
    queryKey: ["public-settings"],
    queryFn: getPublicSettings,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const { data: userRow } = useQuery({
    queryKey: ["user-usdt", user?.id],
    queryFn: () => getUser(user!.id),
    enabled: !!user?.id,
    staleTime: 10000,
  });

  const minWithdraw = publicSettings?.minWithdraw || 50;
  const usdtEnabled = (publicSettings?.usdtPayoutEnabled || "off") === "on";
  const usdtRate = publicSettings?.usdtRatePerAccount || 0.05;
  const usdtMin = publicSettings?.usdtMinWithdraw || 0.5;
  const usdtFeePct = publicSettings?.usdtFeePercent || 2;
  const verifiedTotal = (userRow?.key_count || 0) + (userRow?.reverify_count || 0);
  const usdtPaidCount = userRow?.usdt_paid_count || 0;
  const availableCount = Math.max(0, verifiedTotal - usdtPaidCount);
  const referralEarnings = Number((userRow as any)?.referral_usdt_earnings || 0);
  const accountsUsdt = +(availableCount * usdtRate).toFixed(4);
  const usdtBalance = +(accountsUsdt + referralEarnings).toFixed(4);

  const withdrawLockRemainingMs = getRemainingMilliseconds(publicSettings?.withdrawLockUntil, nowMs);
  const isWithdrawLocked = withdrawLockRemainingMs > 0;
  const lockCountdownText = formatCountdown(withdrawLockRemainingMs);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!usdtEnabled && system === "usdt") setSystem("bdt");
  }, [usdtEnabled, system]);

  useEffect(() => {
    onSystemChange?.(system);
  }, [system, onSystemChange]);

  const { mutate: withdraw, isPending } = useMutation({
    mutationFn: async () => {
      const result = await requestWithdraw(user!.id, method, number, Number(amount));
      try {
        await supabase.functions.invoke("send-telegram", {
          body: {
            message: `💸 <b>Withdrawal Request</b>\n👤 User: ${user!.guest_id}\n📱 Method: ${method.toUpperCase()}\n📞 Number: ${number}\n💰 Amount: ${amount} TK`,
          },
        });
      } catch (e) {
        console.error("Telegram notification failed:", e);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setNumber("");
      setAmount("");
      toast({ title: "উইথড্র রিকোয়েস্ট পাঠানো হয়েছে" });
    },
    onError: (err: any) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const { mutate: payoutUsdt, isPending: isUsdtPending } = useMutation({
    mutationFn: async () => {
      return await requestUsdtPayout(user!.id, usdtAddress.trim(), Number(usdtAmount));
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
      queryClient.invalidateQueries({ queryKey: ["user-usdt"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setUsdtAddress("");
      setUsdtAmount("");
      toast({ title: "USDT পাঠানো হয়েছে ⚡", description: `TX: ${res.tx_hash.slice(0, 10)}…` });
    },
    onError: (err: any) => {
      toast({ title: "ব্যর্থ", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isWithdrawLocked) {
      toast({ title: `উইথড্র সাময়িকভাবে বন্ধ — ${lockCountdownText} পরে আবার চেষ্টা করুন`, variant: "destructive" });
      return;
    }
    if (system === "usdt") {
      if (!usdtAddress || !usdtAmount) return;
      if (!/^0x[a-fA-F0-9]{40}$/.test(usdtAddress.trim())) {
        toast({ title: "ভুল ঠিকানা", description: "Base network এর সঠিক address দিন (0x...)", variant: "destructive" });
        return;
      }
      payoutUsdt();
    } else {
      if (!number || !amount) return;
      withdraw();
    }
  };

  const usdtAmountNum = Number(usdtAmount) || 0;
  const usdtFee = +(usdtAmountNum * usdtFeePct / 100).toFixed(4);
  const usdtReceive = Math.max(0, +(usdtAmountNum - usdtFee).toFixed(4));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isWithdrawLocked && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-center"
        >
          <p className="text-xs text-muted-foreground mb-1">উইথড্র চালু হবে</p>
          <p className="text-2xl font-black text-destructive tracking-wide">{lockCountdownText}</p>
        </motion.div>
      )}

      {usdtEnabled && (
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-secondary/40 border border-border">
          <button
            type="button"
            onClick={() => setSystem("bdt")}
            className={`py-3 rounded-xl font-bold text-sm transition-all ${
              system === "bdt"
                ? "bg-[hsl(var(--cyan))]/15 text-[hsl(var(--cyan))] border border-[hsl(var(--cyan))]/40 shadow-sm"
                : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">💵 টাকা (BDT)</div>
            <div className="text-[9px] opacity-80 mt-0.5 font-normal">রি-ভেরিফাই → bKash/Nagad</div>
          </button>
          <button
            type="button"
            onClick={() => setSystem("usdt")}
            className={`py-3 rounded-xl font-bold text-sm transition-all ${
              system === "usdt"
                ? "bg-[hsl(var(--emerald))]/15 text-[hsl(var(--emerald))] border border-[hsl(var(--emerald))]/40 shadow-sm"
                : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <div className="flex items-center justify-center gap-1.5"><TetherLogo className="w-4 h-4" /> USDT</div>
            <div className="text-[9px] opacity-80 mt-0.5 font-normal">⚡ Instant · Base network</div>
          </button>
        </div>
      )}

      {system === "usdt" ? (
        <>
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-[hsl(var(--emerald))]/30 bg-gradient-to-br from-[hsl(var(--emerald))]/15 to-[hsl(var(--emerald))]/5 p-5"
          >
            <div className="flex items-center gap-2 justify-center mb-1">
              <TetherLogo className="w-5 h-5" />
              <p className="text-xs text-muted-foreground uppercase tracking-widest">USDT Balance</p>
            </div>
            <p className="text-5xl font-black text-[hsl(var(--emerald))] text-center">
              {fmtUsdt(usdtBalance)}<span className="text-lg ml-1">USDT</span>
            </p>
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              Accounts: {availableCount} × {usdtRate} = {fmtUsdt(accountsUsdt)}{referralEarnings > 0 ? ` · Reffer: ${fmtUsdt(referralEarnings)}` : ""}
            </p>
          </motion.div>

          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 flex gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-destructive font-medium">
              ⚠️ সতর্কতা: শুধুমাত্র <b>BASE network</b> এর USDT address দিন। অন্য network (TRC20/BEP20/ERC20/Solana) এর address দিলে আপনার USDT চিরতরে হারিয়ে যাবে। ভুল ঠিকানার জন্য আমরা কোনোভাবেই দায়ী নই।
            </p>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-2">Base USDT Address</label>
            <input
              type="text"
              value={usdtAddress}
              onChange={(e) => setUsdtAddress(e.target.value)}
              placeholder="0x..."
              className="input-field font-mono text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-2">পরিমাণ (কমপক্ষে {usdtMin} USDT)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-bold">USDT</span>
              <input
                type="number"
                step="0.01"
                value={usdtAmount}
                onChange={(e) => setUsdtAmount(e.target.value)}
                placeholder="0.00"
                min={usdtMin}
                max={usdtBalance}
                className="input-field pl-16"
                required
              />
            </div>
          </div>

          {usdtAmountNum > 0 && (
            <div className="rounded-xl border border-border bg-secondary/50 p-3 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">পরিমাণ</span><span className="font-mono">{usdtAmountNum} USDT</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">ফি ({usdtFeePct}%)</span><span className="font-mono text-destructive">−{usdtFee} USDT</span></div>
              <div className="flex justify-between pt-1 border-t border-border"><span className="font-bold">আপনি পাবেন</span><span className="font-mono font-black text-[hsl(var(--emerald))]">{usdtReceive} USDT</span></div>
            </div>
          )}

          <button
            type="submit"
            disabled={isUsdtPending || isWithdrawLocked || !usdtAddress || !usdtAmount || usdtAmountNum > usdtBalance || usdtAmountNum < usdtMin}
            className="btn-primary mt-2 bg-[hsl(var(--emerald))]"
          >
            {isUsdtPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>এখনই USDT পাঠান</span><Zap className="w-5 h-5" /></>}
          </button>

          <div className="bg-[hsl(var(--emerald))]/10 border border-[hsl(var(--emerald))]/20 rounded-xl p-3 mt-2">
            <p className="text-[11px] text-[hsl(var(--emerald))] leading-relaxed text-center font-medium">
              ⚡ USDT তাৎক্ষণিকভাবে আপনার Base wallet এ পৌঁছে যাবে (২-৫ সেকেন্ড)
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMethod("bkash")}
              className={`p-3 rounded-xl border-2 transition-all font-semibold text-sm ${
                method === "bkash"
                  ? "border-[hsl(var(--pink))] bg-[hsl(var(--pink))]/10 text-[hsl(var(--pink))]"
                  : "border-border bg-secondary/50 text-muted-foreground hover:bg-secondary"
              }`}
            >
              bKash
            </button>
            <button
              type="button"
              onClick={() => setMethod("nagad")}
              className={`p-3 rounded-xl border-2 transition-all font-semibold text-sm ${
                method === "nagad"
                  ? "border-[hsl(var(--orange))] bg-[hsl(var(--orange))]/10 text-[hsl(var(--orange))]"
                  : "border-border bg-secondary/50 text-muted-foreground hover:bg-secondary"
              }`}
            >
              Nagad
            </button>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-2">একাউন্ট নাম্বার</label>
            <input type="tel" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="017xxxxxxxx" className="input-field" required />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-2">পরিমাণ (কমপক্ষে {minWithdraw} টাকা)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">৳</span>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" min={minWithdraw} max={balance} className="input-field pl-8" required />
            </div>
          </div>

          <button type="submit" disabled={isPending || isWithdrawLocked || !number || !amount || Number(amount) > balance} className="btn-primary mt-2">
            {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>উইথড্র রিকোয়েস্ট পাঠান</span><CreditCard className="w-5 h-5" /></>}
          </button>

          <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 mt-4">
            <p className="text-xs text-primary leading-relaxed text-center font-medium flex items-center gap-2 justify-center">
              <Clock className="w-4 h-4" /> {usdtEnabled ? "bKash/Nagad পেমেন্ট দিতে দেরি হতে পারে — দ্রুত পেতে USDT ব্যবহার করুন।" : "উইথড্র দেওয়ার ২৪ ঘণ্টার মধ্যে পেমেন্ট করা হবে। যেকোনো সমস্যায় টেলিগ্রামে যোগাযোগ করুন।"}
            </p>
          </div>
        </>
      )}
    </form>
  );
}
