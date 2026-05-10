import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Gift, Copy, Check, Share2, Users, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { applyReferralCode, getReferralStats, getPublicSettings, getUser } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";

export function ReferralCard() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [codeInput, setCodeInput] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["public-settings"],
    queryFn: getPublicSettings,
    staleTime: 30000,
  });

  const { data: userRow } = useQuery({
    queryKey: ["user-ref", user?.id],
    queryFn: () => getUser(user!.id),
    enabled: !!user?.id,
    staleTime: 10000,
  });

  const { data: stats } = useQuery({
    queryKey: ["referral-stats", user?.id],
    queryFn: () => getReferralStats(user!.id),
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const applyMut = useMutation({
    mutationFn: () => applyReferralCode(user!.id, codeInput),
    onSuccess: async () => {
      toast({ title: "✅ রেফার কোড সফলভাবে যুক্ত হয়েছে", description: "এটি স্থায়ীভাবে সেট হয়ে গেছে, আর পরিবর্তন করা যাবে না" });
      setCodeInput("");
      await refreshUser();
      qc.invalidateQueries({ queryKey: ["user-ref"] });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  if (!user || !userRow) return null;

  const myCode = (userRow as any).referral_code || "";
  const earnings = Number((userRow as any).referral_usdt_earnings || 0);
  const bonus = settings?.referralBonusUsd || 0.05;
  const isReferred = !!(userRow as any).referred_by_user_id;
  const refLink = typeof window !== "undefined" ? `${window.location.origin}/register?ref=${myCode}` : "";

  const copy = (text: string, label: string) => {
    copyToClipboard(text);
    setCopied(true);
    toast({ title: `${label} copy hoyeche` });
    setTimeout(() => setCopied(false), 1500);
  };

  const share = async () => {
    const text = `আমার রেফার কোড দিয়ে Good App এ জয়েন করো: ${myCode}\n${refLink}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Good App", text, url: refLink }); } catch {}
    } else {
      copy(text, "রেফার লিংক");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-3xl border border-[hsl(var(--emerald))]/25 overflow-hidden"
    >
      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[hsl(var(--emerald))]/30 to-[hsl(var(--cyan))]/20 flex items-center justify-center border border-[hsl(var(--emerald))]/30">
            <Gift className="w-5 h-5 text-[hsl(var(--emerald))]" />
          </div>
          <div>
            <h2 className="text-lg font-black flex items-center gap-1.5">
              রেফার করে আয় করুন <Sparkles className="w-4 h-4 text-[hsl(var(--amber))]" />
            </h2>
            <p className="text-[10px] text-muted-foreground">বন্ধুকে রেফার করলে প্রতিটি ভেরিফাইতে {bonus}$ বোনাস</p>
          </div>
        </div>

        {/* Earnings + stats */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-2xl bg-gradient-to-br from-[hsl(var(--emerald))]/15 to-[hsl(var(--emerald))]/5 border border-[hsl(var(--emerald))]/25 p-3 text-center">
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground">মোট আয়</p>
            <p className="text-2xl font-black text-[hsl(var(--emerald))]">
              {earnings.toFixed(2).replace(/\.?0+$/, "") || "0"}<span className="text-xs ml-0.5">$</span>
            </p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-[hsl(var(--cyan))]/15 to-[hsl(var(--cyan))]/5 border border-[hsl(var(--cyan))]/25 p-3 text-center">
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground flex items-center gap-1 justify-center"><Users className="w-3 h-3" /> রেফার করেছেন</p>
            <p className="text-2xl font-black text-[hsl(var(--cyan))]">
              {stats?.count || 0}
              <span className="text-[10px] text-muted-foreground ml-1">({stats?.verifiedAccounts || 0} ভেরিফাই)</span>
            </p>
          </div>
        </div>

        {/* My code */}
        <div className="rounded-xl border border-border bg-secondary/40 p-3 mb-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">আপনার রেফার কোড</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono font-black text-lg tracking-widest text-[hsl(var(--emerald))]">{myCode}</code>
            <button
              onClick={() => copy(myCode, "কোড")}
              className="px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
              type="button"
            >
              {copied ? <Check className="w-4 h-4 text-[hsl(var(--emerald))]" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => copy(refLink, "লিংক")}
            className="flex-1 py-2.5 rounded-xl border border-border bg-secondary/50 hover:bg-secondary text-sm font-bold flex items-center justify-center gap-1.5"
          >
            <Copy className="w-4 h-4" /> লিংক কপি
          </button>
          <button
            type="button"
            onClick={share}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[hsl(var(--emerald))] to-[hsl(var(--cyan))] text-white text-sm font-black flex items-center justify-center gap-1.5"
          >
            <Share2 className="w-4 h-4" /> শেয়ার
          </button>
        </div>

        {/* Apply code if not referred yet */}
        {!isReferred && (
          <div className="mt-4 pt-4 border-t border-border/60">
            <p className="text-[11px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">বন্ধু আপনাকে রেফার করেছে?</p>
            <p className="text-[10px] text-[hsl(var(--amber))] mb-2">⚠️ একবার অ্যাপ্লাই করলে আর পরিবর্তন করা যাবে না</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="রেফার কোড"
                maxLength={12}
                className="input-field font-mono uppercase tracking-widest text-sm"
              />
              <button
                type="button"
                onClick={() => applyMut.mutate()}
                disabled={applyMut.isPending || codeInput.length < 4}
                className="px-4 rounded-xl bg-[hsl(var(--emerald))] text-white font-bold text-sm disabled:opacity-50"
              >
                অ্যাপ্লাই
              </button>
            </div>
          </div>
        )}

        {isReferred && (
          <div className="mt-4 pt-4 border-t border-border/60">
            <p className="text-[11px] text-[hsl(var(--emerald))] flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> আপনি ইতিমধ্যে একটি রেফার কোড ব্যবহার করেছেন (স্থায়ী)
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}