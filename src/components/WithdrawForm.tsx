import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requestWithdraw, getPublicSettings, requestUsdtPayout, getUser } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CreditCard, Zap, Clock, AlertTriangle, Coins } from "lucide-react";
import { motion } from "framer-motion";
import { formatCountdown, getRemainingMilliseconds } from "@/lib/countdown";

export function WithdrawForm({ balance }: { balance: number }) {
  const [method, setMethod] = useState<"usdt" | "bkash" | "nagad">("usdt");
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
  const usdtBalance = +(availableCount * usdtRate).toFixed(4);

  const withdrawLockRemainingMs = getRemainingMilliseconds(publicSettings?.withdrawLockUntil, nowMs);
  const isWithdrawLocked = withdrawLockRemainingMs > 0;
  const lockCountdownText = formatCountdown(withdrawLockRemainingMs);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!usdtEnabled && method === "usdt") setMethod("bkash");
  }, [usdtEnabled, method]);

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
    if (method === "usdt") {
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
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-[hsl(var(--emerald))]/30 bg-[hsl(var(--emerald))]/10 p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Coins className="w-3 h-3" /> USDT Balance</p>
              <p className="text-2xl font-black text-[hsl(var(--emerald))]">{usdtBalance.toFixed(4)} <span className="text-sm">USDT</span></p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground">Verified accounts</p>
              <p className="text-sm font-bold">{availableCount} × {usdtRate}</p>
            </div>
          </div>
        </motion.div>
      )}

      <div className={`grid gap-3 ${usdtEnabled ? "grid-cols-3" : "grid-cols-2"}`}>
        {usdtEnabled && (
          <button
            type="button"
            onClick={() => setMethod("usdt")}
            className={`p-3 rounded-xl border-2 transition-all font-semibold text-sm ${
              method === "usdt"
                ? "border-[hsl(var(--emerald))] bg-[hsl(var(--emerald))]/10 text-[hsl(var(--emerald))]"
                : "border-border bg-secondary/50 text-muted-foreground hover:bg-secondary"
            }`}
          >
            <div className="flex items-center justify-center gap-1"><Zap className="w-3.5 h-3.5" /> USDT</div>
            <div className="text-[9px] opacity-80 mt-0.5">⚡ Fast</div>
          </button>
        )}
        <button
          type="button"
          onClick={() => setMethod("bkash")}
          className={`p-3 rounded-xl border-2 transition-all font-semibold text-sm ${
            method === "bkash"
              ? "border-[hsl(var(--pink))] bg-[hsl(var(--pink))]/10 text-[hsl(var(--pink))]"
              : "border-border bg-secondary/50 text-muted-foreground hover:bg-secondary"
          }`}
        >
          <div>bKash</div>
          {usdtEnabled && <div className="text-[9px] opacity-80 mt-0.5">⏰ Late</div>}
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
          <div>Nagad</div>
          {usdtEnabled && <div className="text-[9px] opacity-80 mt-0.5">⏰ Late</div>}
        </button>
      </div>

      {method === "usdt" ? (
        <>
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
