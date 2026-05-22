import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Crown, Medal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getLevel } from "@/lib/gamification";

type Row = {
  id: number;
  display_name: string | null;
  avatar_url: string | null;
  reverify_count: number;
  is_verified_badge: boolean;
};

export function Leaderboard() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRank, setMyRank] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("users")
        .select("id,display_name,avatar_url,reverify_count,is_verified_badge,is_blocked")
        .order("reverify_count", { ascending: false })
        .limit(50);
      if (!alive) return;
      const list = ((data || []) as any[]).filter((r) => !r.is_blocked && (r.reverify_count || 0) > 0).slice(0, 10);
      setRows(list);

      if (user?.id) {
        const { count } = await supabase
          .from("users")
          .select("id", { count: "exact", head: true })
          .gt("reverify_count", user.reverify_count || 0)
          .eq("is_blocked", false);
        if (alive) setMyRank((count || 0) + 1);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user?.id, user?.reverify_count]);

  const medal = (i: number) => {
    if (i === 0) return <span className="text-xl">🥇</span>;
    if (i === 1) return <span className="text-xl">🥈</span>;
    if (i === 2) return <span className="text-xl">🥉</span>;
    return <span className="text-xs font-black text-muted-foreground w-5 text-center">{i + 1}</span>;
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--violet))]/25 bg-gradient-to-br from-[hsl(var(--violet))]/10 to-[hsl(var(--cyan))]/5 backdrop-blur-md">
      <div className="relative p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[hsl(var(--violet))]/20 flex items-center justify-center">
              <Crown className="w-4 h-4 text-[hsl(var(--violet))]" />
            </div>
            <div>
              <h3 className="text-base font-black leading-tight">🏆 Top Earners</h3>
              <p className="text-[10px] text-muted-foreground font-semibold">সেরা ১০ Verify মাস্টার</p>
            </div>
          </div>
          {myRank !== null && (
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground font-semibold">আপনার Rank</p>
              <p className="text-base font-black">#{myRank}</p>
            </div>
          )}
        </div>

        {loading ? (
          <div className="py-6 text-center text-xs text-muted-foreground">লোড হচ্ছে...</div>
        ) : rows.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">এখনো কেউ লিডারবোর্ডে নেই</div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r, i) => {
              const lvl = getLevel(r.reverify_count || 0);
              const isMe = user?.id === r.id;
              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`flex items-center gap-2.5 p-2 rounded-xl border ${
                    isMe
                      ? "border-[hsl(var(--cyan))]/50 bg-[hsl(var(--cyan))]/10"
                      : i < 3
                      ? "border-[hsl(var(--amber))]/25 bg-background/30"
                      : "border-white/5 bg-background/20"
                  }`}
                >
                  <div className="w-6 flex items-center justify-center shrink-0">{medal(i)}</div>
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-muted shrink-0 border border-white/10">
                    {r.avatar_url ? (
                      <img src={r.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-black">
                        {(r.display_name || "U").charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-xs font-bold truncate">{r.display_name || "User"}{isMe && " (আপনি)"}</p>
                      {r.is_verified_badge && <span className="text-[10px]">✔️</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground font-semibold">{lvl.current.emoji} {lvl.current.nameBn}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black">{r.reverify_count}</p>
                    <p className="text-[9px] text-muted-foreground font-semibold">Account</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}