import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { getPublicSettings } from "@/lib/api";

type FeedItem = {
  id: string;
  name: string;
  amount: number;
  ago: string;
};

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.max(1, Math.floor(diff / 1000));
  if (s < 60) return `${s} সে. আগে`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} মি. আগে`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ঘ. আগে`;
  return `${Math.floor(h / 24)} দিন আগে`;
}

export function LiveEarningFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const { data: settings } = useQuery({ queryKey: ["public-settings"], queryFn: getPublicSettings, staleTime: 60000 });
  const rate = Number(settings?.rewardRate || 40);

  const load = async () => {
    const { data } = await supabase
      .from("reverify_queue")
      .select("id,completed_at,assigned_user_id,status")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(15);
    const rows = (data || []) as any[];
    const ids = Array.from(new Set(rows.map((r) => r.assigned_user_id).filter(Boolean)));
    if (ids.length === 0) { setItems([]); return; }
    const { data: users } = await supabase
      .from("users")
      .select("id,display_name,guest_id")
      .in("id", ids);
    const umap = new Map<number, any>((users || []).map((u: any) => [u.id, u]));
    const list: FeedItem[] = rows.slice(0, 12).map((r) => {
      const u = umap.get(r.assigned_user_id);
      const name = (u?.display_name || u?.guest_id || "User") as string;
      return { id: r.id, name, amount: rate, ago: timeAgo(r.completed_at || new Date().toISOString()) };
    });
    setItems(list);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    const ch = supabase
      .channel("live-earn-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "reverify_queue" }, () => load())
      .subscribe();
    return () => { clearInterval(t); supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--emerald))]/25 bg-gradient-to-br from-[hsl(var(--emerald))]/10 to-[hsl(var(--cyan))]/5 backdrop-blur-md">
      <div className="relative p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative w-9 h-9 rounded-xl bg-[hsl(var(--emerald))]/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-[hsl(var(--emerald))]" />
              <motion.span
                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[hsl(var(--emerald))]"
                animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
            </div>
            <div>
              <h3 className="text-base font-black leading-tight">💬 Live Earnings</h3>
              <p className="text-[10px] text-muted-foreground font-semibold">এখনই যারা আয় করছেন</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[hsl(var(--emerald))]/15 border border-[hsl(var(--emerald))]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--emerald))] animate-pulse" />
            <span className="text-[9px] font-black text-[hsl(var(--emerald))]">LIVE</span>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">কিছুক্ষণের মধ্যেই আপডেট আসবে...</div>
        ) : (
          <div className="relative h-[180px] overflow-hidden">
            <AnimatePresence initial={false}>
              <motion.div
                key={items[0]?.id}
                className="space-y-1.5"
                animate={{ y: [0, -((items.length - 4) * 44)] }}
                transition={{ duration: Math.max(6, items.length * 1.5), repeat: Infinity, ease: "linear" }}
              >
                {items.concat(items).map((it, i) => (
                  <div
                    key={`${it.id}-${i}`}
                    className="flex items-center gap-2 p-2 rounded-xl border border-white/5 bg-background/30"
                  >
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[hsl(var(--emerald))] to-[hsl(var(--cyan))] flex items-center justify-center text-[10px] font-black text-background shrink-0">
                      {it.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold truncate">
                        <span className="text-[hsl(var(--cyan))]">{it.name}</span> earn করলো{" "}
                        <span className="text-[hsl(var(--emerald))] font-black">৳{it.amount}</span>
                      </p>
                      <p className="text-[9px] text-muted-foreground font-semibold">{it.ago} • Re-verify ✅</p>
                    </div>
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
            <div className="pointer-events-none absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-background to-transparent" />
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background to-transparent" />
          </div>
        )}
      </div>
    </div>
  );
}