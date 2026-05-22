import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Gift, Copy, Check, Share2, Users, Sparkles, Crown, DollarSign, TrendingUp, Link2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { applyReferralCode, getReferralStats, getReferralHistory, getPublicSettings, getUser } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";

export function ReferralCard() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [codeInput, setCodeInput] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["public-settings"],
    queryFn: getPublicSettings,
    staleTime: 30000,
  });

  const { data: userRow } = useQuery({
    queryKey: ["user-ref", user?.id],
    queryFn: () => getUser(user!.id),
    enabled: !!user?.id,
    staleTime: 10000,
  });

  const { data: stats } = useQuery({
    queryKey: ["referral-stats", user?.id],
    queryFn: () => getReferralStats(user!.id),
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const bonus = settings?.referralBonusUsd || 0.05;

  const { data: history } = useQuery({
    queryKey: ["referral-history", user?.id, bonus],
    queryFn: () => getReferralHistory(user!.id, bonus),
    enabled: !!user?.id,
    staleTime: 30000,
  });
  const [showHistory, setShowHistory] = useState(false);

  const applyMut = useMutation({
    mutationFn: () => applyReferralCode(user!.id, codeInput),
    onSuccess: async () => {
      toast({ title: "✅ রেফার কোড সফলভাবে যুক্ত হয়েছে", description: "এটি স্থায়ীভাবে সেট হয়ে গেছে, আর পরিবর্তন করা যাবে না" });
      setCodeInput("");
      await refreshUser();
      qc.invalidateQueries({ queryKey: ["user-ref"] });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  if (!user || !userRow) return null;

  const myCode = (userRow as any).referral_code || "";
  const earnings = Number((userRow as any).referral_usdt_earnings || 0);
  const isReferred = !!(userRow as any).referred_by_user_id;
  const refLink = typeof window !== "undefined" ? `${window.location.origin}/register?ref=${myCode}` : "";

  const copy = (text: string, label: string) => {
    copyToClipboard(text);
    setCopied(true);
    toast({ title: `${label} copy hoyeche` });
    setTimeout(() => setCopied(false), 1500);
  };

  const share = async () => {
    const text =
`🎁 Good App — রেফার করে আয় করুন! 💎

আসসালামু আলাইকুম 👋
আমি Good App ব্যবহার করছি এবং এখান থেকে রিয়েল USDT ইনকাম করা যাচ্ছে ✅

👉 আমার রেফার কোড দিয়ে জয়েন করো, প্রতিটি অ্যাকাউন্ট ভেরিফাই করলে আমি পাবো ${bonus}$ (USDT) বোনাস 💰

🔑 রেফার কোড: ${myCode}
🔗 জয়েন লিংক: ${refLink}

📌 কিভাবে কাজ করে:
• লিংকে ক্লিক করে রেজিস্টার করো (কোড অটো বসে যাবে)
• অথবা রেজিস্টার ফর্মে "${myCode}" বসিয়ে দাও
• তোমার অ্যাকাউন্ট ভেরিফাই হলেই আমার ওয়ালেটে ${bonus}$ যোগ হবে

যত বেশি ভেরিফাই, তত বেশি ইনকাম 🚀`;
    if (navigator.share) {
      try { await navigator.share({ title: "Good App", text, url: refLink }); } catch {}
    } else {
      copy(text, "রেফার লিংক");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-3xl overflow-hidden border border-[hsl(var(--amber))]/30 shadow-[0_20px_60px_-20px_hsl(var(--emerald)/0.5)]"
      style={{
        background:
          "radial-gradient(120% 80% at 0% 0%, hsl(var(--emerald)/0.18), transparent 55%), radial-gradient(120% 80% at 100% 0%, hsl(var(--amber)/0.15), transparent 55%), radial-gradient(120% 100% at 50% 100%, hsl(var(--cyan)/0.15), transparent 60%), linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)",
      }}
    >
      {/* Decorative glow blobs */}
      <div className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full bg-[hsl(var(--amber))]/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-16 w-56 h-56 rounded-full bg-[hsl(var(--emerald))]/20 blur-3xl" />

      {/* Premium ribbon */}
      <div className="relative flex items-center justify-between px-5 pt-4">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-[hsl(var(--amber))]/25 to-[hsl(var(--amber))]/10 border border-[hsl(var(--amber))]/40">
          <Crown className="w-3 h-3 text-[hsl(var(--amber))]" />
          <span className="text-[9px] font-black uppercase tracking-widest text-[hsl(var(--amber))]">Premium</span>
        </div>
        <div className="flex items-center gap-1 text-[9px] font-bold text-[hsl(var(--emerald))]">
          <TrendingUp className="w-3 h-3" /> LIVE
        </div>
      </div>

      <div className="relative p-5 pt-3">
        <div className="flex items-start gap-3 mb-4">
          <motion.div
            animate={{ rotate: [0, -8, 8, -4, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3 }}
            className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[hsl(var(--amber))] via-[hsl(var(--emerald))] to-[hsl(var(--cyan))] flex items-center justify-center shadow-lg shadow-[hsl(var(--emerald))]/30"
          >
            <Gift className="w-7 h-7 text-white drop-shadow" />
          </motion.div>
          <div className="flex-1">
            <h2 className="text-xl font-black flex items-center gap-1.5 bg-gradient-to-r from-[hsl(var(--amber))] via-[hsl(var(--emerald))] to-[hsl(var(--cyan))] bg-clip-text text-transparent">
              রেফার করে আয় <Sparkles className="w-4 h-4 text-[hsl(var(--amber))]" />
            </h2>
            <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
              বন্ধুকে রেফার করুন — প্রতি ভেরিফাইতে{" "}
              <span className="font-black text-[hsl(var(--emerald))]">{bonus}$</span> USDT সরাসরি আপনার ওয়ালেটে 💰
            </p>
          </div>
        </div>

        {/* Premium bonus highlight */}
        <div className="relative rounded-2xl overflow-hidden mb-4 border border-[hsl(var(--amber))]/30">
          <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--amber))]/15 via-[hsl(var(--emerald))]/15 to-[hsl(var(--cyan))]/15" />
          <div className="relative px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[hsl(var(--amber))] to-[hsl(var(--emerald))] flex items-center justify-center shadow-md">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">প্রতি ভেরিফাইতে</p>
              <p className="text-2xl font-black leading-none">
                <span className="bg-gradient-to-r from-[hsl(var(--amber))] to-[hsl(var(--emerald))] bg-clip-text text-transparent">
                  ${bonus}
                </span>
                <span className="text-xs text-muted-foreground ml-1.5">USDT বোনাস</span>
              </p>
            </div>
          </div>
        </div>

        {/* Earnings + stats */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="relative rounded-2xl p-3 text-center overflow-hidden border border-[hsl(var(--emerald))]/30 bg-gradient-to-br from-[hsl(var(--emerald))]/20 to-transparent">
            <div className="absolute -top-6 -right-6 w-16 h-16 rounded-full bg-[hsl(var(--emerald))]/20 blur-2xl" />
            <p className="relative text-[9px] uppercase tracking-widest text-muted-foreground font-bold">মোট আয়</p>
            <p className="relative text-2xl font-black text-[hsl(var(--emerald))] mt-0.5">
              {earnings.toFixed(2).replace(/\.?0+$/, "") || "0"}
              <span className="text-xs ml-0.5">$</span>
            </p>
          </div>
          <div className="relative rounded-2xl p-3 text-center overflow-hidden border border-[hsl(var(--cyan))]/30 bg-gradient-to-br from-[hsl(var(--cyan))]/20 to-transparent">
            <div className="absolute -top-6 -right-6 w-16 h-16 rounded-full bg-[hsl(var(--cyan))]/20 blur-2xl" />
            <p className="relative text-[9px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1 justify-center">
              <Users className="w-3 h-3" /> রেফার
            </p>
            <p className="relative text-2xl font-black text-[hsl(var(--cyan))] mt-0.5">
              {stats?.count || 0}
              <span className="text-[10px] text-muted-foreground ml-1">({stats?.verifiedAccounts || 0} ভেরিফাই)</span>
            </p>
          </div>
        </div>

        {/* My code — premium */}
        <div className="relative rounded-2xl p-[1.5px] mb-3 bg-gradient-to-r from-[hsl(var(--amber))] via-[hsl(var(--emerald))] to-[hsl(var(--cyan))]">
          <div className="rounded-[14px] bg-card/95 backdrop-blur-sm p-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">আপনার রেফার কোড</p>
              <span className="text-[9px] font-black text-[hsl(var(--amber))] flex items-center gap-0.5">
                <Crown className="w-2.5 h-2.5" /> VIP
              </span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono font-black text-xl tracking-[0.25em] bg-gradient-to-r from-[hsl(var(--emerald))] to-[hsl(var(--cyan))] bg-clip-text text-transparent">
                {myCode}
              </code>
              <button
                onClick={() => copy(myCode, "কোড")}
                className="px-3 py-2 rounded-lg bg-gradient-to-br from-[hsl(var(--emerald))]/20 to-[hsl(var(--cyan))]/20 hover:from-[hsl(var(--emerald))]/30 hover:to-[hsl(var(--cyan))]/30 border border-[hsl(var(--emerald))]/30 transition-all"
                type="button"
              >
                {copied ? <Check className="w-4 h-4 text-[hsl(var(--emerald))]" /> : <Copy className="w-4 h-4 text-[hsl(var(--emerald))]" />}
              </button>
            </div>
          </div>
        </div>

        {/* Referral link preview */}
        <div className="rounded-xl border border-border/60 bg-secondary/30 p-2.5 mb-3 flex items-center gap-2">
          <Link2 className="w-3.5 h-3.5 text-[hsl(var(--cyan))] flex-shrink-0" />
          <p className="flex-1 text-[10px] text-muted-foreground truncate font-mono">{refLink}</p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => copy(refLink, "লিংক")}
            className="flex-1 py-3 rounded-xl border border-[hsl(var(--cyan))]/30 bg-secondary/50 hover:bg-secondary text-sm font-black flex items-center justify-center gap-1.5 transition-all"
          >
            <Copy className="w-4 h-4" /> লিংক কপি
          </button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={share}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[hsl(var(--amber))] via-[hsl(var(--emerald))] to-[hsl(var(--cyan))] text-white text-sm font-black flex items-center justify-center gap-1.5 shadow-lg shadow-[hsl(var(--emerald))]/40"
          >
            <Share2 className="w-4 h-4" /> শেয়ার
          </motion.button>
        </div>

        {/* Apply code if not referred yet */}
        {!isReferred && (
          <div className="mt-4 pt-4 border-t border-border/60">
            <p className="text-[11px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">বন্ধু আপনাকে রেফার করেছে?</p>
            <p className="text-[10px] text-[hsl(var(--amber))] mb-2">⚠️ একবার অ্যাপ্লাই করলে আর পরিবর্তন করা যাবে না</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="রেফার কোড"
                maxLength={12}
                className="input-field font-mono uppercase tracking-widest text-sm"
              />
              <button
                type="button"
                onClick={() => applyMut.mutate()}
                disabled={applyMut.isPending || codeInput.length < 4}
                className="px-4 rounded-xl bg-[hsl(var(--emerald))] text-white font-bold text-sm disabled:opacity-50"
              >
                অ্যাপ্লাই
              </button>
            </div>
          </div>
        )}

        {isReferred && (
          <div className="mt-4 pt-4 border-t border-border/60">
            <p className="text-[11px] text-[hsl(var(--emerald))] flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> আপনি ইতিমধ্যে একটি রেফার কোড ব্যবহার করেছেন (স্থায়ী)
            </p>
          </div>
        )}

        {/* Referral history */}
        {history && history.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border/60">
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowHistory((v) => !v)}
              className="w-full mb-3 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[hsl(var(--emerald))] via-[hsl(var(--cyan))] to-[hsl(var(--purple))] text-white font-black flex items-center justify-between shadow-lg shadow-[hsl(var(--emerald))]/40 border border-white/20"
            >
              <span className="flex items-center gap-2 text-sm">
                📋 Refer History
                <span className="px-2 py-0.5 rounded-full bg-white/25 text-[11px] font-black">{history.length}</span>
              </span>
              <span className="text-xs font-black bg-white/20 px-2.5 py-1 rounded-lg">
                {showHistory ? "▲ লুকান" : "▼ দেখুন"}
              </span>
            </motion.button>
            {showHistory && (
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className={`flex items-center gap-2 p-2 rounded-xl border ${
                      h.status === "earning"
                        ? "border-[hsl(var(--emerald))]/30 bg-[hsl(var(--emerald))]/5"
                        : "border-[hsl(var(--amber))]/25 bg-[hsl(var(--amber))]/5"
                    }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-black shrink-0">
                      {h.avatar_url ? (
                        <img src={h.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        h.name[0]?.toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold leading-snug whitespace-normal break-words">{h.name}</p>
                      <p className="text-[9px] text-muted-foreground">
                        {h.verified_count} Re-verify
                      </p>
                    </div>
                    <div className="text-right">
                      {h.status === "earning" ? (
                        <>
                          <p className="text-[11px] font-black text-[hsl(var(--emerald))]">
                            +${h.earned_usdt.toFixed(3).replace(/\.?0+$/, "")}
                          </p>
                          <p className="text-[8px] font-bold text-[hsl(var(--emerald))]/80">PAID</p>
                        </>
                      ) : (
                        <>
                          <p className="text-[10px] font-black text-[hsl(var(--amber))]">$0.00</p>
                          <p className="text-[8px] font-bold text-[hsl(var(--amber))]/90">⏳ PENDING</p>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[9px] text-muted-foreground mt-2 text-center">
              💡 Pending user-ra Re-verify korlei automatic earning add hobe
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}