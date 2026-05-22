import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Gift, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type Row = { id: number; name: string; avatar: string | null; count: number };

function monthLabelBn(): string {
  const months = ["জানুয়ারি","ফেব্রুয়ারি","মার্চ","এপ্রিল","মে","জুন","জুলাই","আগস্ট","সেপ্টেম্বর","অক্টোবর","নভেম্বর","ডিসেম্বর"];
  return months[new Date().getMonth()];
}

export function MonthlyReferralContest() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [myCount, setMyCount] = useState(0);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // Fetch users referred this month (only those who have referrer)
      const { data } = await supabase
        .from("users")
        .select("referred_by_user_id,created_at,reverify_count")
        .gte("created_at", start)
        .not("referred_by_user_id", "is", null)
        .gt("reverify_count", 0)
        .limit(1000);

      const counts = new Map<number, number>();
      (data || []).forEach((r: any) => {
        const id = r.referred_by_user_id as number;
        counts.set(id, (counts.get(id) || 0) + 1);
      });
      const ids = Array.from(counts.keys());
      if (ids.length === 0) {
        if (alive) { setRows([]); setLoading(false); setMyCount(0); setMyRank(null); }
        return;
      }
      const { data: users } = await supabase
        .from("users")
        .select("id,display_name,guest_id,avatar_url,is_blocked")
        .in("id", ids);
      const list: Row[] = (users || [])
        .filter((u: any) => !u.is_blocked)
        .map((u: any) => {
          const name = (u.display_name || u.guest_id || "User") as string;
          return { id: u.id, name, avatar: u.avatar_url, count: counts.get(u.id) || 0 };
        })
        .sort((a, b) => b.count - a.count);

      if (!alive) return;
      setRows(list.slice(0, 5));

      if (user?.id) {
        const mine = counts.get(user.id) || 0;
        setMyCount(mine);
        const rank = list.findIndex((r) => r.id === user.id);
        setMyRank(rank >= 0 ? rank + 1 : null);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user?.id]);

  const prizes = ["৳500", "৳300", "৳200"];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--pink))]/25 bg-gradient-to-br from-[hsl(var(--pink))]/10 via-[hsl(var(--orange))]/5 to-[hsl(var(--amber))]/5 backdrop-blur-md">
      <div className="relative p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[hsl(var(--pink))]/20 flex items-center justify-center">
              <Gift className="w-4 h-4 text-[hsl(var(--pink))]" />
            </div>
            <div>
              <h3 className="text-base font-black leading-tight">📢 Refer Contest</h3>
              <p className="text-[10px] text-muted-foreground font-semibold">{monthLabelBn()} মাসের Top Referrers</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground font-semibold">আপনার Refer</p>
            <p className="text-base font-black text-[hsl(var(--pink))]">{myCount}{myRank ? ` • #${myRank}` : ""}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => {
            const r = rows[i];
            const medals = ["🥇", "🥈", "🥉"];
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className={`rounded-xl border p-2 text-center ${
                  i === 0
                    ? "border-[hsl(var(--amber))]/40 bg-gradient-to-b from-[hsl(var(--amber))]/15 to-transparent"
                    : "border-white/10 bg-background/30"
                }`}
              >
                <div className="text-lg leading-none">{medals[i]}</div>
                <p className="text-[10px] font-black mt-1 truncate">{r ? r.name : "—"}</p>
                <p className="text-[9px] text-muted-foreground font-semibold">{r ? `${r.count} refer` : "খালি"}</p>
                <div className="mt-1 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[hsl(var(--pink))]/15 text-[hsl(var(--pink))] inline-block">
                  {prizes[i]}
                </div>
              </motion.div>
            );
          })}
        </div>

        {rows.length > 3 && (
          <div className="space-y-1">
            {rows.slice(3).map((r, i) => (
              <div key={r.id} className="flex items-center gap-2 p-1.5 rounded-lg border border-white/5 bg-background/20">
                <span className="text-[10px] font-black w-5 text-center text-muted-foreground">#{i + 4}</span>
                <p className="text-[11px] font-bold flex-1 truncate">{r.name}</p>
                <p className="text-[11px] font-black">{r.count}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 p-2 rounded-xl border border-[hsl(var(--amber))]/25 bg-[hsl(var(--amber))]/5">
          <Trophy className="w-3.5 h-3.5 text-[hsl(var(--amber))] shrink-0" />
          <p className="text-[10px] font-bold leading-snug">
            মাস শেষে Top 3 জন বোনাস প্রাইজ পাবে! এখনই বন্ধুদের refer করুন 🚀
          </p>
        </div>

        {loading && rows.length === 0 && (
          <div className="py-3 text-center text-[10px] text-muted-foreground">লোড হচ্ছে...</div>
        )}
      </div>
    </div>
  );
}