import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Megaphone, Users, TrendingUp, DollarSign, Copy, Check } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { copyToClipboard } from "@/lib/clipboard";

export function PromoOwnerCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["promo-owner-stats", user?.id],
    enabled: !!user?.id,
    refetchInterval: 30000,
    queryFn: async () => {
      // 1. Owner's codes
      const { data: codes } = await supabase
        .from("promo_codes")
        .select("code, is_active, total_uses, total_earned_usdt, created_at")
        .eq("owner_user_id", user!.id)
        .order("created_at", { ascending: false });

      if (!codes || codes.length === 0) return { codes: [], users: [], totals: null };

      const codeStrings = codes.map((c) => (c.code || "").toUpperCase());

      // 2. Users who used any of these codes
      const { data: users } = await supabase
        .from("users")
        .select("id, guest_id, display_name, reverify_count, key_count, promo_code_used, created_at")
        .in("promo_code_used", codeStrings)
        .order("created_at", { ascending: false });

      // 3. Owner's own accumulated USDT earnings
      const { data: me } = await supabase
        .from("users")
        .select("promo_owner_usdt_earnings")
        .eq("id", user!.id)
        .maybeSingle();

      const totalUses = codes.reduce((s, c) => s + (c.total_uses || 0), 0);
      const totalEarned = Number(me?.promo_owner_usdt_earnings || 0);
      const totalReverified = (users || []).reduce((s, u: any) => s + (u.reverify_count || 0), 0);

      return {
        codes,
        users: users || [],
        totals: { totalUses, totalEarned, totalReverified },
      };
    },
  });

  if (isLoading || !data || data.codes.length === 0) return null;

  const handleCopy = async (code: string) => {
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopied(true);
      toast({ title: "✅ Promo code কপি হয়েছে" });
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-[hsl(var(--purple))]/15 via-card to-primary/10 p-5 shadow-xl"
    >
      {/* glow orbs */}
      <div className="pointer-events-none absolute -top-12 -right-10 h-40 w-40 rounded-full bg-[hsl(var(--purple))]/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-10 h-40 w-40 rounded-full bg-primary/25 blur-3xl" />

      {/* header */}
      <div className="relative flex items-center gap-3 mb-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--purple))] to-primary shadow-lg ring-2 ring-background">
          <Megaphone className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-black tracking-widest text-primary/80 uppercase">Promo Owner</p>
          <h3 className="text-base font-black text-foreground leading-tight">🎬 আপনার Promo Code Earnings</h3>
        </div>
      </div>

      {/* code chips */}
      <div className="relative space-y-2 mb-4">
        {data.codes.map((c) => (
          <div
            key={c.code}
            className="flex items-center justify-between gap-2 rounded-2xl bg-background/70 backdrop-blur border border-border/60 px-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base font-black tracking-wider text-foreground truncate">{c.code}</span>
              <span
                className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                  c.is_active ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"
                }`}
              >
                {c.is_active ? "ACTIVE" : "OFF"}
              </span>
            </div>
            <button
              onClick={() => handleCopy(c.code)}
              className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80 active:scale-95 transition"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              কপি
            </button>
          </div>
        ))}
      </div>

      {/* stats grid */}
      <div className="relative grid grid-cols-3 gap-2 mb-4">
        <StatBox icon={<Users className="h-3.5 w-3.5" />} label="ব্যবহারকারী" value={data.totals!.totalUses} />
        <StatBox icon={<TrendingUp className="h-3.5 w-3.5" />} label="Re-verified" value={data.totals!.totalReverified} />
        <StatBox
          icon={<DollarSign className="h-3.5 w-3.5" />}
          label="আয় (USDT)"
          value={data.totals!.totalEarned.toFixed(3)}
          accent
        />
      </div>

      {/* user list */}
      {data.users.length > 0 && (
        <div className="relative">
          <p className="text-[10px] font-black tracking-wider text-muted-foreground uppercase mb-2">
            👥 যারা আপনার Code use করেছে ({data.users.length})
          </p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {data.users.map((u: any) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-background/60 backdrop-blur border border-border/50 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-foreground truncate">
                    {u.display_name || u.guest_id}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">UID: {u.guest_id}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-black text-primary">{u.reverify_count || 0} ✅</p>
                  <p className="text-[9px] text-muted-foreground">Re-verified</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.users.length === 0 && (
        <p className="relative text-center text-xs text-muted-foreground py-2">
          এখনো কেউ আপনার Code use করেনি
        </p>
      )}
    </motion.div>
  );
}

function StatBox({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl px-2 py-2.5 text-center backdrop-blur border ${
        accent
          ? "bg-gradient-to-br from-primary/20 to-[hsl(var(--purple))]/20 border-primary/30"
          : "bg-background/70 border-border/60"
      }`}
    >
      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
        {icon}
      </div>
      <p className="text-sm font-black text-foreground leading-none">{value}</p>
      <p className="text-[9px] text-muted-foreground mt-1 font-bold">{label}</p>
    </div>
  );
}