import { motion } from "framer-motion";
import { getAchievements } from "@/lib/gamification";
import { useAuth } from "@/hooks/use-auth";
import { Trophy } from "lucide-react";

export function AchievementBadges() {
  const { user } = useAuth();
  const items = getAchievements(user);
  const earnedCount = items.filter((i) => i.earned).length;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--amber))]/25 bg-gradient-to-br from-[hsl(var(--amber))]/10 to-[hsl(var(--orange))]/5 backdrop-blur-md">
      <div className="relative p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[hsl(var(--amber))]/20 flex items-center justify-center">
              <Trophy className="w-4 h-4 text-[hsl(var(--amber))]" />
            </div>
            <div>
              <h3 className="text-base font-black leading-tight">🏅 Achievements</h3>
              <p className="text-[10px] text-muted-foreground font-semibold">আপনার অর্জন</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground font-semibold">আনলক</p>
            <p className="text-lg font-black">{earnedCount}/{items.length}</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {items.map((a, i) => (
            <motion.div
              key={a.key}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              className={`relative aspect-square rounded-xl border flex flex-col items-center justify-center p-1.5 text-center ${
                a.earned
                  ? "border-[hsl(var(--amber))]/40 bg-gradient-to-br from-[hsl(var(--amber))]/20 to-[hsl(var(--orange))]/10 shadow-lg shadow-[hsl(var(--amber))]/10"
                  : "border-white/5 bg-background/30 opacity-50 grayscale"
              }`}
              title={`${a.title} — ${a.desc}`}
            >
              <div className="text-xl leading-none">{a.emoji}</div>
              <div className="text-[8px] font-bold mt-1 leading-tight line-clamp-2">{a.title}</div>
              {a.earned && (
                <motion.div
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[hsl(var(--emerald))] border border-background flex items-center justify-center text-[7px] font-black"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  ✓
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}