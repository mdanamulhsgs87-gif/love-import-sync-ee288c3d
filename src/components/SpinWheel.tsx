import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
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

  // Count successful referrals (users that signed up with this user's referral_code)
  const { data: referralCount = 0 } = useQuery({
    queryKey: ["referralCount", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { count } = await supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("referred_by_user_id", user!.id);
      return count || 0;
    },
    staleTime: 60000,
  });

  const signupBonus = 1;                              // 🎁 1 free spin on new account
  const reverifyEarned = Math.floor(rv / 10);          // 1 spin per 10 reverify
  const referralBonus = Math.floor(referralCount / 5) * 2; // +2 spins per 5 referrals
  const earned = signupBonus + reverifyEarned + referralBonus;
  const available = Math.max(0, earned - used);
  const nextReferralIn = 5 - (referralCount % 5);

  const segAngle = 360 / SEGMENTS.length;

  const handleSpin = async () => {
    if (!user || spinning) return;
    if (available <= 0) {
      toast({
        title: "🎡 কোনো Spin বাকি নেই",
        description: "দয়া করে আরও Re-verify করুন এবং নতুন Spin জিতে নিন!",
        variant: "destructive",
      });
      return;
    }
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
            <p className="text-[10px] text-muted-foreground font-semibold">🎁 1 Free + প্রতি 10 Re-verify = 1 Spin • 5 Refer = +2 Spin</p>
          </div>
        </div>
      </div>

      <div className="relative mx-auto w-[280px] h-[280px] my-4">
        {/* Pointer (top, pointing down) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-20">
          <div className="w-0 h-0 border-l-[14px] border-r-[14px] border-t-[24px] border-l-transparent border-r-transparent border-t-[hsl(var(--amber))] drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]" />
        </div>

        {/* Wheel */}
        <motion.svg
          viewBox="-100 -100 200 200"
          className="absolute inset-0 w-full h-full drop-shadow-2xl"
          animate={{ rotate: rotation }}
          transition={{ duration: 4, ease: [0.17, 0.67, 0.21, 0.99] }}
          style={{ transformOrigin: "50% 50%" }}
        >
          {SEGMENTS.map((s, i) => {
            // Segment from startAngle to endAngle, with 0deg at top, going clockwise
            const startAngle = i * segAngle - 90; // -90 so first segment starts at top
            const endAngle = startAngle + segAngle;
            const sRad = (startAngle * Math.PI) / 180;
            const eRad = (endAngle * Math.PI) / 180;
            const r = 95;
            const x1 = Math.cos(sRad) * r;
            const y1 = Math.sin(sRad) * r;
            const x2 = Math.cos(eRad) * r;
            const y2 = Math.sin(eRad) * r;
            const largeArc = segAngle > 180 ? 1 : 0;
            const path = `M 0 0 L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

            // Label position (mid-radius)
            const midAngle = startAngle + segAngle / 2;
            const mRad = (midAngle * Math.PI) / 180;
            const lr = 65;
            const lx = Math.cos(mRad) * lr;
            const ly = Math.sin(mRad) * lr;
            // Rotate text to be readable along the radial direction
            const textRotate = midAngle + 90;

            return (
              <g key={i}>
                <path d={path} fill={s.color} stroke="rgba(255,255,255,0.4)" strokeWidth={0.8} />
                <text
                  x={lx}
                  y={ly}
                  fill="white"
                  fontSize={s.value >= 100 ? 10 : 11}
                  fontWeight={900}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${textRotate} ${lx} ${ly})`}
                  style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.35)", strokeWidth: 0.6 }}
                >
                  {s.label}
                </text>
              </g>
            );
          })}
          {/* Outer ring */}
          <circle cx={0} cy={0} r={97} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={3} />
        </motion.svg>

        {/* Center button (does NOT rotate) */}
        <button
          onClick={handleSpin}
          disabled={spinning}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[72px] h-[72px] rounded-full bg-gradient-to-br from-white to-slate-200 border-4 border-[hsl(var(--purple))] shadow-2xl flex flex-col items-center justify-center font-black text-[12px] text-[hsl(var(--purple))] z-10 disabled:opacity-70 disabled:cursor-not-allowed active:scale-95 transition-transform"
        >
          {spinning ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span className="leading-none mt-0.5">SPIN</span>
            </>
          )}
        </button>
      </div>

      {/* Spin count display - below wheel */}
      <div className="mt-2 rounded-xl border border-[hsl(var(--purple))]/30 bg-gradient-to-r from-[hsl(var(--purple))]/15 via-[hsl(var(--pink))]/10 to-[hsl(var(--amber))]/15 px-3 py-2.5">
        {available > 0 ? (
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4 text-[hsl(var(--amber))]" />
            <p className="text-center text-[13px] font-black text-[hsl(var(--purple))]">
              আপনার <span className="text-[hsl(var(--emerald))] text-base">{available}</span> টি Spin বাকি আছে — এখনই ঘোরান! 🎉
            </p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-[12px] font-black text-muted-foreground">
              🔒 আপনার কোনো Spin বাকি নেই
            </p>
            <p className="text-[11px] font-semibold text-[hsl(var(--purple))] mt-0.5">
              আর <span className="text-[hsl(var(--amber))] font-black">{nextSpinIn}</span> টি Re-verify অথবা <span className="text-[hsl(var(--emerald))] font-black">{nextReferralIn}</span> জন Refer করলে নতুন Spin পাবেন ✨
            </p>
          </div>
        )}
      </div>
    </div>
  );
}