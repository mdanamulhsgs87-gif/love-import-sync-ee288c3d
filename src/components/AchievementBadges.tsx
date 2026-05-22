import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getPublicSettings } from "@/lib/api";
import { Trophy, Lock, Check, Sparkles, Loader2 } from "lucide-react";

type Tier = { key: string; need: number; bonusUsdt: number; emoji: string; label: string };

const TIERS: Tier[] = [
  // USDT amounts mapped from original BDT plan (rate ~124 BDT/USDT)
  { key: "t2",   need: 2,   bonusUsdt: 0.02, emoji: "🎯", label: "Starter" },  // ~2৳
  { key: "t5",   need: 5,   bonusUsdt: 0.06, emoji: "🔥", label: "Hot" },      // ~7৳
  { key: "t10",  need: 10,  bonusUsdt: 0.12, emoji: "⚡", label: "Power" },    // ~15৳
  { key: "t20",  need: 20,  bonusUsdt: 0.24, emoji: "💎", label: "Pro" },      // ~30৳
  { key: "t50",  need: 50,  bonusUsdt: 0.65, emoji: "🏆", label: "Master" },   // ~80৳
  { key: "t100", need: 100, bonusUsdt: 1.60, emoji: "👑", label: "King" },     // ~200৳
  { key: "t250", need: 250, bonusUsdt: 4.00, emoji: "🌟", label: "Legend" },   // ~500৳
  { key: "t500", need: 500, bonusUsdt: 8.00, emoji: "🚀", label: "Elite" },    // ~1000৳
];

function UsdtIcon({ size = 14 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-[#26A17B] text-white font-black shadow-sm shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.72, lineHeight: 1 }}
    >
      ₮
    </span>
  );
}

export function AchievementBadges() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [claimingKey, setClaimingKey] = useState<string | null>(null);
  const { data: settings } = useQuery({ queryKey: ["publicSettings"], queryFn: getPublicSettings, staleTime: 60000 });
  const rate = Number(settings?.usdtToBdtRate || 124);

  const rv = Number(user?.reverify_count || 0);
  const claimed: string[] = Array.isArray((user as any)?.achievements_claimed)
    ? (user as any).achievements_claimed
    : [];
  const earnedCount = TIERS.filter((t) => claimed.includes(t.key)).length;

  const handleClaim = async (tier: Tier) => {
    if (!user || claimingKey) return;
    if (rv < tier.need) return;
    if (claimed.includes(tier.key)) return;
    setClaimingKey(tier.key);
    try {
      const newClaimed = [...claimed, tier.key];
      const bonusBdt = Math.round(tier.bonusUsdt * rate);
      const newBonus = Number((user as any).bonus_claimed_bdt || 0) + bonusBdt;
      const { error } = await supabase
        .from("users")
        .update({
          achievements_claimed: newClaimed as any,
          bonus_claimed_bdt: newBonus,
        })
        .eq("id", user.id);
      if (error) throw error;
      toast({
        title: `🎉 ${tier.bonusUsdt} USDT bonus claimed!`,
        description: `${tier.emoji} ${tier.label} unlocked! Wallet এ যোগ হয়েছে — BDT বা USDT তে withdraw করতে পারবেন।`,
      });
      await refreshUser();
    } catch (e: any) {
      toast({ title: "Claim ব্যর্থ", description: e.message || "আবার চেষ্টা করুন", variant: "destructive" });
    } finally {
      setClaimingKey(null);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--amber))]/25 bg-gradient-to-br from-[hsl(var(--amber))]/10 to-[hsl(var(--orange))]/5 backdrop-blur-md">
      <div className="relative p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[hsl(var(--amber))]/20 flex items-center justify-center">
              <Trophy className="w-4 h-4 text-[hsl(var(--amber))]" />
            </div>
            <div>
              <h3 className="text-base font-black leading-tight">🏅 Bonus Achievements</h3>
              <p className="text-[10px] text-muted-foreground font-semibold">Re-verify করে USDT বোনাস claim করুন</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground font-semibold">Claimed</p>
            <p className="text-lg font-black">{earnedCount}/{TIERS.length}</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {TIERS.map((t, i) => {
            const isClaimed = claimed.includes(t.key);
            const isReady = rv >= t.need && !isClaimed;
            const isLocked = rv < t.need;
            return (
              <motion.button
                key={t.key}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => isReady && handleClaim(t)}
                disabled={!isReady || !!claimingKey}
                title={`${t.need} Re-verify → ${t.bonusUsdt} USDT`}
                className={`relative aspect-square rounded-xl border flex flex-col items-center justify-center p-1.5 text-center overflow-hidden ${
                  isClaimed
                    ? "border-[hsl(var(--emerald))]/50 bg-[hsl(var(--emerald))]/15"
                    : isReady
                    ? "border-[hsl(var(--amber))]/60 bg-gradient-to-br from-[hsl(var(--amber))]/25 to-[hsl(var(--orange))]/15 shadow-lg shadow-[hsl(var(--amber))]/20 cursor-pointer"
                    : "border-white/5 bg-background/30 opacity-70"
                }`}
              >
                {isReady && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none"
                    animate={{ x: ["-100%", "200%"] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
                  />
                )}
                <UsdtIcon size={36} />
                <div className="text-[10px] font-black mt-1 leading-tight text-muted-foreground">
                  {t.need} Re-verify
                </div>
                <div className="text-[11px] font-black text-[#26A17B] leading-tight">
                  {t.bonusUsdt} USDT
                </div>
                {isClaimed ? (
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[hsl(var(--emerald))] border border-background flex items-center justify-center text-[8px] font-black text-white">
                    ✓
                  </div>
                ) : isReady ? (
                  <div className="absolute -top-1 -right-1 px-1 h-4 rounded-full bg-[hsl(var(--amber))] border border-background flex items-center justify-center text-[7px] font-black text-white animate-pulse">
                    {claimingKey === t.key ? "…" : "Claim"}
                  </div>
                ) : (
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-background border border-white/10 flex items-center justify-center">
                    <Lock className="w-2 h-2 text-muted-foreground" />
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}