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

        <div className="grid grid-cols-1 gap-2">
          {TIERS.map((t, i) => {
            const isClaimed = claimed.includes(t.key);
            const isReady = rv >= t.need && !isClaimed;
            const isLocked = rv < t.need;
            const progress = Math.min(100, (rv / t.need) * 100);
            return (
              <motion.div
                key={t.key}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`relative overflow-hidden rounded-xl border p-3 ${
                  isClaimed
                    ? "border-[hsl(var(--emerald))]/40 bg-[hsl(var(--emerald))]/10"
                    : isReady
                    ? "border-[hsl(var(--amber))]/60 bg-gradient-to-r from-[hsl(var(--amber))]/20 to-[hsl(var(--orange))]/10"
                    : "border-white/5 bg-background/30"
                }`}
              >
                {isReady && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                    animate={{ x: ["-100%", "200%"] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  />
                )}
                <div className="relative flex items-center gap-3">
                  <div className={`text-2xl ${isLocked ? "grayscale opacity-50" : ""}`}>{t.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-black truncate">{t.need} Re-verify</p>
                      <span className="text-[10px] font-bold text-muted-foreground">→</span>
                      <p className="text-sm font-black text-[hsl(var(--amber))]">৳{t.bonus}</p>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-background/50 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isClaimed ? "bg-[hsl(var(--emerald))]" : "bg-gradient-to-r from-[hsl(var(--amber))] to-[hsl(var(--orange))]"
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-[9px] text-muted-foreground font-semibold mt-0.5">
                      {Math.min(rv, t.need)}/{t.need}
                    </p>
                  </div>
                  {isClaimed ? (
                    <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[hsl(var(--emerald))]/20 text-[hsl(var(--emerald))] text-[10px] font-black">
                      <Check className="w-3 h-3" /> Claimed
                    </div>
                  ) : isReady ? (
                    <motion.button
                      whileTap={{ scale: 0.94 }}
                      onClick={() => handleClaim(t)}
                      disabled={!!claimingKey}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[hsl(var(--amber))] to-[hsl(var(--orange))] text-white text-[11px] font-black shadow-lg shadow-[hsl(var(--amber))]/30 disabled:opacity-60"
                    >
                      {claimingKey === t.key ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      Claim
                    </motion.button>
                  ) : (
                    <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-background/50 text-muted-foreground text-[10px] font-bold">
                      <Lock className="w-3 h-3" /> Locked
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}