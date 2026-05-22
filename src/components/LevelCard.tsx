import { motion } from "framer-motion";
import { getLevel } from "@/lib/gamification";
import { useAuth } from "@/hooks/use-auth";

export function LevelCard() {
  const { user } = useAuth();
  const rv = Number(user?.reverify_count || 0);
  const { current, next, progress, toNext } = getLevel(rv);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${current.gradient} backdrop-blur-md`}>
      <div className="relative p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ rotate: [0, -8, 8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="text-3xl drop-shadow-lg"
            >
              {current.emoji}
            </motion.div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">আপনার লেভেল</p>
              <h3 className="text-lg font-black leading-tight">{current.nameBn} <span className="text-xs font-bold opacity-70">({current.name})</span></h3>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground font-semibold">Account</p>
            <p className="text-xl font-black">{rv}</p>
          </div>
        </div>

        {next ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold">
              <span className="text-muted-foreground">{current.nameBn} → {next.nameBn} {next.emoji}</span>
              <span>আরো {toNext}টি বাকি</span>
            </div>
            <div className="h-2 rounded-full bg-background/40 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className={`h-full rounded-full bg-gradient-to-r from-[hsl(var(--${current.color}))] to-[hsl(var(--cyan))]`}
              />
            </div>
          </div>
        ) : (
          <div className="text-center py-1.5 rounded-xl bg-background/30 border border-white/10">
            <p className="text-xs font-black">🎉 আপনি সর্বোচ্চ লেভেলে! আপনি একজন ডায়মন্ড লেজেন্ড 👑</p>
          </div>
        )}
      </div>
    </div>
  );
}