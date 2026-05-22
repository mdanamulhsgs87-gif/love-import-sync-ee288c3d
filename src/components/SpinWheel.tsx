import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Loader2, Gift } from "lucide-react";

// Display segments around the wheel (some big ones are pure decoration with 0% weight)
type Segment = { label: string; value: number; weight: number; color: string };

const SEGMENTS: Segment[] = [
  { label: "৳1",    value: 1,    weight: 38, color: "#f59e0b" },
  { label: "৳4000", value: 4000, weight: 0,  color: "#ef4444" },
  { label: "৳3",    value: 3,    weight: 30, color: "#10b981" },
  { label: "৳0.5",  value: 0.5,  weight: 10, color: "#06b6d4" },
  { label: "৳1000", value: 1000, weight: 0,  color: "#8b5cf6" },
  { label: "৳5",    value: 5,    weight: 9,  color: "#ec4899" },
  { label: "৳500",  value: 500,  weight: 0.5, color: "#f43f5e" },
  { label: "৳7",    value: 7,    weight: 5,  color: "#3b82f6" },
  { label: "৳50",   value: 50,   weight: 1.5, color: "#a855f7" },
  { label: "৳10",   value: 10,   weight: 3,  color: "#14b8a6" },
  { label: "৳4",    value: 4,    weight: 3,  color: "#eab308" },
  { label: "৳2000", value: 2000, weight: 0,  color: "#dc2626" },
];

function pickWeighted(): number {
  const total = SEGMENTS.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < SEGMENTS.length; i++) {
    r -= SEGMENTS[i].weight;
    if (r <= 0) return i;
  }
  return 0;
}

export function SpinWheel() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);

  const rv = Number(user?.reverify_count || 0);
  const used = Number((user as any)?.spin_used_count || 0);
  const earned = Math.floor(rv / 10);
  const available = Math.max(0, earned - used);

  const segAngle = 360 / SEGMENTS.length;

  const wheelGradient = useMemo(() => {
    let acc = 0;
    const stops = SEGMENTS.map((s) => {
      const start = acc;
      acc += segAngle;
      return `${s.color} ${start}deg ${acc}deg`;
    }).join(", ");
    return `conic-gradient(${stops})`;
  }, [segAngle]);

  const handleSpin = async () => {
    if (!user || spinning || available <= 0) return;
    setSpinning(true);

    const idx = pickWeighted();
    const prize = SEGMENTS[idx];
    // Pointer is at top (0deg). To land segment idx under pointer,
    // we want the segment's center to be at the top after rotation.
    const segCenter = idx * segAngle + segAngle / 2;
    const targetAngle = 360 - segCenter; // bring it to top
    const spins = 6;
    const final = rotation + spins * 360 + (targetAngle - (rotation % 360));
    setRotation(final);

    setTimeout(async () => {
      try {
        const prizeBdt = prize.value;
        // Add prize to bonus_claimed_bdt (auto adds to balance via trigger)
        const { error } = await supabase
          .from("users")
          .update({
            spin_used_count: used + 1,
            bonus_claimed_bdt: Number((user as any).bonus_claimed_bdt || 0) + prizeBdt,
          })
          .eq("id", user.id);
        if (error) throw error;
        toast({
          title: `🎉 আপনি জিতেছেন ৳${prizeBdt}!`,
          description: "টাকা সরাসরি wallet এ যোগ হয়েছে। BDT/USDT তে withdraw করতে পারবেন।",
        });
        await refreshUser();
      } catch (e: any) {
        toast({ title: "Spin ব্যর্থ", description: e.message || "আবার চেষ্টা করুন", variant: "destructive" });
      } finally {
        setSpinning(false);
      }
    }, 4200);
  };

  const nextSpinIn = 10 - (rv % 10);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--purple))]/30 bg-gradient-to-br from-[hsl(var(--purple))]/15 via-[hsl(var(--pink))]/10 to-[hsl(var(--amber))]/10 backdrop-blur-md p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-[hsl(var(--purple))]/20 flex items-center justify-center">
            <Gift className="w-4 h-4 text-[hsl(var(--purple))]" />
          </div>
          <div>
            <h3 className="text-base font-black leading-tight">🎡 Lucky Spin</h3>
            <p className="text-[10px] text-muted-foreground font-semibold">প্রতি ১০ Re-verify = ১ Spin</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground font-semibold">Available</p>
          <p className="text-lg font-black text-[hsl(var(--purple))]">{available}</p>
        </div>
      </div>

      <div className="relative mx-auto w-[260px] h-[260px] my-4">
        {/* Pointer */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-20">
          <div className="w-0 h-0 border-l-[12px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-white drop-shadow-lg" />
        </div>

        {/* Wheel */}
        <motion.div
          className="absolute inset-0 rounded-full shadow-2xl border-4 border-white/30"
          style={{ background: wheelGradient }}
          animate={{ rotate: rotation }}
          transition={{ duration: 4, ease: [0.17, 0.67, 0.21, 0.99] }}
        >
          {SEGMENTS.map((s, i) => {
            const angle = i * segAngle + segAngle / 2;
            return (
              <div
                key={i}
                className="absolute top-1/2 left-1/2 origin-left text-[11px] font-black text-white drop-shadow-md whitespace-nowrap"
                style={{
                  transform: `rotate(${angle}deg) translate(40px, -6px)`,
                }}
              >
                {s.label}
              </div>
            );
          })}
        </motion.div>

        {/* Center button */}
        <button
          onClick={handleSpin}
          disabled={spinning || available <= 0}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-gradient-to-br from-white to-slate-200 border-4 border-[hsl(var(--purple))] shadow-2xl flex flex-col items-center justify-center font-black text-[11px] text-[hsl(var(--purple))] z-10 disabled:opacity-70 disabled:cursor-not-allowed active:scale-95 transition-transform"
        >
          {spinning ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              SPIN
            </>
          )}
        </button>
      </div>

      {available > 0 ? (
        <p className="text-center text-[11px] font-bold text-[hsl(var(--emerald))]">
          ✨ আপনার {available} টি Spin আছে — এখনই ঘোরান!
        </p>
      ) : (
        <p className="text-center text-[11px] font-semibold text-muted-foreground">
          🔒 আর {nextSpinIn} টি Re-verify করলে নতুন Spin পাবেন
        </p>
      )}
    </div>
  );
}