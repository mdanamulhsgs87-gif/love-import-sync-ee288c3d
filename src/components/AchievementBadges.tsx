import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Lock, Check, Sparkles, Loader2 } from "lucide-react";

type Tier = { key: string; need: number; bonus: number; emoji: string; label: string };

const TIERS: Tier[] = [
  { key: "t2",   need: 2,   bonus: 2,    emoji: "🎯", label: "Starter" },
  { key: "t5",   need: 5,   bonus: 7,    emoji: "🔥", label: "Hot" },
  { key: "t10",  need: 10,  bonus: 15,   emoji: "⚡", label: "Power" },
  { key: "t20",  need: 20,  bonus: 30,   emoji: "💎", label: "Pro" },
  { key: "t50",  need: 50,  bonus: 80,   emoji: "🏆", label: "Master" },
  { key: "t100", need: 100, bonus: 200,  emoji: "👑", label: "King" },
  { key: "t250", need: 250, bonus: 500,  emoji: "🌟", label: "Legend" },
  { key: "t500", need: 500, bonus: 1000, emoji: "🚀", label: "Elite" },
];

export function AchievementBadges() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [claimingKey, setClaimingKey] = useState<string | null>(null);

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
      const newBonus = Number((user as any).bonus_claimed_bdt || 0) + tier.bonus;
      const { error } = await supabase
        .from("users")
        .update({
          achievements_claimed: newClaimed as any,
          bonus_claimed_bdt: newBonus,
        })
        .eq("id", user.id);
      if (error) throw error;
      toast({
        title: `🎉 ৳${tier.bonus} bonus claimed!`,
        description: `${tier.emoji} ${tier.label} achievement unlocked. টাকা wallet এ যোগ হয়েছে।`,
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
              <p className="text-[10px] text-muted-foreground font-semibold">Re-verify করে বোনাস claim করুন</p>
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
                title={`${t.need} Re-verify → ৳${t.bonus}`}
                className={`relative aspect-square rounded-xl border flex flex-col items-center justify-center p-1.5 text-center overflow-hidden ${
                  isClaimed
                    ? "border-[hsl(var(--emerald))]/50 bg-[hsl(var(--emerald))]/15"
                    : isReady
                    ? "border-[hsl(var(--amber))]/60 bg-gradient-to-br from-[hsl(var(--amber))]/25 to-[hsl(var(--orange))]/15 shadow-lg shadow-[hsl(var(--amber))]/20 cursor-pointer"
                    : "border-white/5 bg-background/30 opacity-60 grayscale"
                }`}
              >
                {isReady && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none"
                    animate={{ x: ["-100%", "200%"] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
                  />
                )}
                <div className="text-xl leading-none">{t.emoji}</div>
                <div className="text-[9px] font-black mt-0.5 leading-tight">{t.need}=৳{t.bonus}</div>
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