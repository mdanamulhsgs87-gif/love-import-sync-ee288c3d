import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Sprout, Wheat, Sparkles, Clock, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getPublicSettings } from "@/lib/api";
import { formatCountdown } from "@/lib/countdown";

const REVERIFY_WAIT_HOURS = 72; // 3 দিন (default, admin চাইলে settings এ যোগ করা যাবে)
const WAIT_MS = REVERIFY_WAIT_HOURS * 60 * 60 * 1000;

type QueueItem = {
  id: string;
  status: string;
  created_at: string;
};

export function MaturingWallet() {
  const { user } = useAuth();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: queue = [] } = useQuery<QueueItem[]>({
    queryKey: ["maturing-queue", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reverify_queue")
        .select("id,status,created_at")
        .eq("assigned_user_id", user!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as QueueItem[];
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  const { data: settings } = useQuery({
    queryKey: ["public-settings-maturing"],
    queryFn: getPublicSettings,
    staleTime: 60000,
  });

  const rewardRate = settings?.rewardRate || 40;

  const { ready, growing, nextReadyMs } = useMemo(() => {
    let readyCount = 0;
    const growingItems: { id: string; remainingMs: number; progress: number }[] = [];
    let nextMs: number | null = null;

    for (const item of queue) {
      const matureAt = new Date(item.created_at).getTime() + WAIT_MS;
      const remaining = matureAt - now;
      if (remaining <= 0) {
        readyCount += 1;
      } else {
        const progress = Math.max(0, Math.min(100, ((WAIT_MS - remaining) / WAIT_MS) * 100));
        growingItems.push({ id: item.id, remainingMs: remaining, progress });
        if (nextMs === null || remaining < nextMs) nextMs = remaining;
      }
    }
    return { ready: readyCount, growing: growingItems, nextReadyMs: nextMs };
  }, [queue, now]);

  if (queue.length === 0) return null;

  const readyTk = ready * rewardRate;
  const totalTk = queue.length * rewardRate;

  const scrollToReverify = () => {
    const el = document.getElementById("reverify-start-btn") || document.getElementById("reverify-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("animate-pulse");
      setTimeout(() => el.classList.remove("animate-pulse"), 2000);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl border-2 border-[hsl(var(--emerald))]/40"
    >
      {/* Animated gradient background */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--emerald))]/15 via-[hsl(var(--amber))]/10 to-[hsl(var(--orange))]/10"
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 5, repeat: Infinity }}
      />

      <div className="relative z-10 p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ rotate: [0, 8, -8, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[hsl(var(--emerald))] to-[hsl(var(--amber))] flex items-center justify-center shadow-lg shadow-[hsl(var(--emerald))]/30"
          >
            {ready > 0 ? (
              <Wheat className="w-5 h-5 text-primary-foreground" />
            ) : (
              <Sprout className="w-5 h-5 text-primary-foreground" />
            )}
          </motion.div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-black text-[hsl(var(--emerald))] flex items-center gap-1.5">
              🌾 আপনার ফসল পাকছে
              {ready > 0 && (
                <motion.span
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-[hsl(var(--emerald))] text-primary-foreground font-black"
                >
                  {ready} READY!
                </motion.span>
              )}
            </h2>
            <p className="text-[10px] text-muted-foreground">
              ৩ দিন পর প্রতিটি account থেকে ৳{rewardRate} পাবেন
            </p>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-secondary/60 border border-border/50 p-2.5 text-center">
            <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">পাকছে</div>
            <div className="text-lg font-black text-[hsl(var(--amber))]">{growing.length}</div>
            <div className="text-[9px] text-muted-foreground">≈ ৳{growing.length * rewardRate}</div>
          </div>
          <div className="rounded-2xl bg-[hsl(var(--emerald))]/15 border border-[hsl(var(--emerald))]/40 p-2.5 text-center">
            <div className="text-[9px] text-[hsl(var(--emerald))] font-bold uppercase tracking-wider">পেকেছে</div>
            <motion.div
              animate={ready > 0 ? { scale: [1, 1.1, 1] } : {}}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-lg font-black text-[hsl(var(--emerald))]"
            >
              {ready}
            </motion.div>
            <div className="text-[9px] text-[hsl(var(--emerald))]">৳{readyTk}</div>
          </div>
          <div className="rounded-2xl bg-secondary/60 border border-border/50 p-2.5 text-center">
            <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">মোট</div>
            <div className="text-lg font-black">{queue.length}</div>
            <div className="text-[9px] text-muted-foreground">৳{totalTk}</div>
          </div>
        </div>

        {/* Ready CTA banner */}
        <AnimatePresence>
          {ready > 0 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={scrollToReverify}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-[hsl(var(--emerald))] to-[hsl(var(--amber))] text-primary-foreground text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-[hsl(var(--emerald))]/40"
            >
              <Sparkles className="w-4 h-4" />
              🎉 {ready}টি account এখন ready! ৳{readyTk} claim করুন
            </motion.button>
          )}
        </AnimatePresence>

        {/* Next ready countdown */}
        {ready === 0 && nextReadyMs !== null && (
          <div className="rounded-2xl bg-secondary/40 border border-border/50 p-3 flex items-center gap-3">
            <Clock className="w-4 h-4 text-[hsl(var(--amber))] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-muted-foreground">পরবর্তী ৳{rewardRate} আসছে</div>
              <div className="text-sm font-black text-[hsl(var(--amber))] tabular-nums">
                {formatCountdown(nextReadyMs)}
              </div>
            </div>
            <TrendingUp className="w-4 h-4 text-[hsl(var(--emerald))]" />
          </div>
        )}

        {/* Individual progress rings (max 6) */}
        {growing.length > 0 && (
          <div>
            <div className="text-[10px] font-bold text-muted-foreground mb-2 text-center">
              🌱 প্রতিটি account এর বৃদ্ধি
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {growing.slice(0, 6).map((item) => (
                <ProgressRing
                  key={item.id}
                  progress={item.progress}
                  remainingMs={item.remainingMs}
                />
              ))}
            </div>
            {growing.length > 6 && (
              <div className="text-[10px] text-muted-foreground text-center mt-2">
                + আরো {growing.length - 6} টি পাকছে
              </div>
            )}
          </div>
        )}

        {/* Footer hint */}
        <p className="text-[10px] text-center text-muted-foreground leading-relaxed">
          ১ম verify করার ৩ দিন পর re-verify দিলে balance যোগ হবে। প্রতিদিন verify দিলে ৩ দিন পর থেকে রোজ আয়! 🚀
        </p>
      </div>
    </motion.div>
  );
}

function ProgressRing({ progress, remainingMs }: { progress: number; remainingMs: number }) {
  const size = 60;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  const totalHours = Math.floor(remainingMs / 3600000);
  const label =
    totalHours >= 24
      ? `${Math.floor(totalHours / 24)}d`
      : totalHours >= 1
      ? `${totalHours}h`
      : `${Math.max(1, Math.floor(remainingMs / 60000))}m`;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="hsl(var(--muted))"
            strokeWidth={strokeWidth}
            fill="none"
            opacity={0.3}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="url(#growGradient)"
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={false}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
          <defs>
            <linearGradient id="growGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(var(--amber))" />
              <stop offset="100%" stopColor="hsl(var(--emerald))" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-base">
            {progress < 33 ? "🌱" : progress < 66 ? "🌿" : progress < 95 ? "🌾" : "✨"}
          </span>
        </div>
      </div>
      <div className="text-[10px] font-black text-[hsl(var(--amber))] tabular-nums">{label}</div>
    </div>
  );
}