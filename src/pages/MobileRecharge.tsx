import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getPublicSettings, getUser } from "@/lib/api";
import { calculateSharedBalance } from "@/lib/balance";
import { ArrowLeft, Phone, Smartphone, Loader2, CheckCircle, Zap, Shield, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import gpLogo from "@/assets/operator-gp.png";
import robiLogo from "@/assets/operator-robi.png";
import blLogo from "@/assets/operator-bl.png";
import airtelLogo from "@/assets/operator-airtel.png";
import teletalkLogo from "@/assets/operator-teletalk.png";

const OPERATORS = [
  { id: "gp", name: "গ্রামীণফোন", logo: gpLogo, color: "from-[#4CB848] to-[#2D8E29]" },
  { id: "robi", name: "রবি", logo: robiLogo, color: "from-[#E5222E] to-[#B81A23]" },
  { id: "bl", name: "বাংলালিংক", logo: blLogo, color: "from-[#F58220] to-[#D16B10]" },
  { id: "airtel", name: "এয়ারটেল", logo: airtelLogo, color: "from-[#E40000] to-[#B30000]" },
  { id: "teletalk", name: "টেলিটক", logo: teletalkLogo, color: "from-[#00A651] to-[#007A3D]" },
];

const AMOUNTS = [20, 30, 50, 100, 150, 200, 300, 500];

export default function MobileRecharge() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [operator, setOperator] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [topupBalance, setTopupBalance] = useState<number | null>(null);
  const [balanceChecking, setBalanceChecking] = useState(true);

  const { data: settings } = useQuery({ queryKey: ["public-settings"], queryFn: getPublicSettings });
  const { data: userRow } = useQuery({
    queryKey: ["mobile-recharge-user", user?.id],
    queryFn: () => getUser(user!.id),
    enabled: !!user?.id,
  });
  const { data: userTxs = [] } = useQuery({
    queryKey: ["user-transactions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("amount,type,status").eq("user_id", user!.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });
  const rechargeEnabled = settings?.rechargeEnabled !== "off";

  // Check topup API balance on mount
  useEffect(() => {
    const checkBalance = async () => {
      try {
        const { data } = await supabase.functions.invoke("mobile-recharge", {
          body: { action: "check_balance" },
        });
        setTopupBalance(data?.balance ?? null);
      } catch {
        setTopupBalance(null);
      } finally {
        setBalanceChecking(false);
      }
    };
    checkBalance();
  }, []);

  const RATE = settings?.rewardRate || 40;
  const sharedBalance = calculateSharedBalance(userRow || user, settings, userTxs as any[]);
  const currentKeys = Math.floor(sharedBalance.availableBdt / RATE);
  const maxRecharge = sharedBalance.availableBdt;
  const finalAmount = amount || (customAmount ? parseInt(customAmount) : 0);
  const keysNeeded = finalAmount > 0 ? Math.ceil(finalAmount / RATE) : 0;
  const hasTopupBalance = topupBalance === null || topupBalance >= finalAmount;
  const canRecharge = rechargeEnabled && finalAmount >= RATE && keysNeeded <= currentKeys && phone.length === 11 && operator && hasTopupBalance;
  const selectedOp = OPERATORS.find(o => o.id === operator);

  const handleRecharge = async () => {
    if (!user || !canRecharge) return;
    setLoading(true);
    try {
      // Key deduction now happens server-side in edge function

      const beforeKeys = currentKeys;
      const afterKeys = beforeKeys - keysNeeded;

      const { data: txData } = await supabase
        .from("transactions")
        .insert({
          user_id: user.id,
          type: "recharge",
          amount: finalAmount,
          details: `📱 ${operator.toUpperCase()} রিচার্জ: ${phone} | ${finalAmount} TK (${keysNeeded} Re-verify ব্যবহৃত) | আগে: ${beforeKeys} → পরে: ${afterKeys}`,
          status: "processing",
        })
        .select("id")
        .single();

      const { data: topupResult, error: topupError } = await supabase.functions.invoke("mobile-recharge", {
        body: {
          phone,
          operator,
          amount: finalAmount,
          userId: user.id,
          transactionId: txData?.id,
        },
      });

      if (topupError) {
        await refreshUser();
        throw new Error(topupResult?.error || topupError.message || "রিচার্জ API ত্রুটি");
      }

      if (topupResult?.success) {
        setSuccess(true);
        await refreshUser();
        toast({
          title: "✅ রিচার্জ সফল!",
          description: `${phone} নম্বরে ${finalAmount} TK রিচার্জ হয়েছে।`,
        });
      } else {
        await refreshUser();
        toast({
          title: "❌ রিচার্জ ব্যর্থ",
          description: topupResult?.message || "অপারেটর থেকে রিচার্জ করা যায়নি। কী রিফান্ড হয়েছে।",
          variant: "destructive",
        });
      }

      setTimeout(() => {
        setSuccess(false);
        setPhone("");
        setAmount(null);
        setCustomAmount("");
        setOperator("");
      }, 3000);
    } catch (err: any) {
      toast({ title: "❌ ত্রুটি", description: err.message || "রিচার্জ ব্যর্থ", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Animated background blobs */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-15%] right-[-15%] w-[500px] h-[500px] bg-[hsl(var(--emerald))] opacity-[0.06] rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] bg-[hsl(var(--cyan))] opacity-[0.05] rounded-full blur-[120px]" />
        <div className="absolute top-[40%] left-[50%] w-[300px] h-[300px] bg-[hsl(var(--purple))] opacity-[0.04] rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <div className="sticky top-0 z-30 backdrop-blur-xl border-b border-border/30">
        <div className="bg-gradient-to-r from-[hsl(var(--emerald))]/10 via-[hsl(var(--cyan))]/5 to-transparent">
          <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate("/dashboard")}
              className="p-2.5 rounded-2xl bg-card/80 border border-border/40 hover:bg-muted transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </motion.button>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[hsl(var(--emerald))] to-[hsl(var(--cyan))] flex items-center justify-center shadow-lg shadow-[hsl(var(--emerald))]/20">
                <Smartphone className="h-4.5 w-4.5 text-white" />
              </div>
              <div>
                <h1 className="text-[15px] font-black bg-gradient-to-r from-[hsl(var(--emerald))] via-[hsl(var(--cyan))] to-[hsl(var(--blue))] bg-clip-text text-transparent">
                  মোবাইল রিচার্জ
                </h1>
                <p className="text-[10px] text-muted-foreground font-medium">⚡ তাৎক্ষণিক • অটোমেটিক</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-4 pb-28 space-y-4 relative z-10">

        {/* Balance Hero Card */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-3xl border border-[hsl(var(--emerald))]/25">
          <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--emerald))]/12 via-[hsl(var(--cyan))]/8 to-[hsl(var(--blue))]/12" />
          <motion.div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent"
            animate={{ x: ["-100%", "200%"] }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }} />
          <div className="relative p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">আপনার ব্যালেন্স</p>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <motion.span animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 3, repeat: Infinity }}
                    className="text-4xl font-black bg-gradient-to-r from-[hsl(var(--emerald))] to-[hsl(var(--cyan))] bg-clip-text text-transparent">
                    {currentKeys}
                  </motion.span>
                  <span className="text-sm font-bold text-muted-foreground">Re-verify</span>
                </div>
              </div>
              <div className="text-right">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[hsl(var(--emerald))]/15 border border-[hsl(var(--emerald))]/25">
                  <Zap className="w-3.5 h-3.5 text-[hsl(var(--emerald))]" />
                  <span className="text-[12px] font-black text-[hsl(var(--emerald))]">
                    সর্বোচ্চ {maxRecharge}৳
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 font-medium">১ Re-verify = {RATE}৳</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Recharge disabled notice */}
        {!rechargeEnabled && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="rounded-2xl bg-[hsl(var(--amber))]/10 border-2 border-[hsl(var(--amber))]/30 p-5 text-center">
            <AlertTriangle className="w-8 h-8 text-[hsl(var(--amber))] mx-auto mb-2" />
            <p className="text-[15px] font-black text-[hsl(var(--amber))]">রিচার্জ সেবা বর্তমানে বন্ধ আছে</p>
            <p className="text-[12px] text-muted-foreground mt-1">অ্যাডমিন কর্তৃক সাময়িকভাবে বন্ধ রাখা হয়েছে</p>
          </motion.div>
        )}

        {/* Topup API balance issue */}
        {rechargeEnabled && !balanceChecking && topupBalance !== null && topupBalance < 10 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="rounded-2xl bg-destructive/8 border border-destructive/20 p-4 text-center">
            <AlertTriangle className="w-7 h-7 text-destructive mx-auto mb-1.5" />
            <p className="text-sm font-black text-destructive">⚠️ রিচার্জ সাময়িকভাবে বন্ধ আছে</p>
            <p className="text-[11px] text-muted-foreground mt-1">সিস্টেমে ব্যালেন্স নেই, কিছুক্ষণ পর চেষ্টা করুন</p>
          </motion.div>
        )}

        {currentKeys === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="rounded-2xl bg-destructive/8 border border-destructive/20 p-4 text-center">
            <p className="text-sm font-black text-destructive">⚠️ আপনার কোনো Re-verify সম্পন্ন Account নেই!</p>
            <p className="text-[11px] text-muted-foreground mt-1">প্রথমে Re-verify করে account complete করুন</p>
          </motion.div>
        )}

        {/* Operator Selection */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <p className="text-[13px] font-black text-foreground mb-3 flex items-center gap-2">
            <span className="w-5 h-5 rounded-lg bg-[hsl(var(--cyan))]/15 flex items-center justify-center text-[10px]">১</span>
            অপারেটর বেছে নিন
          </p>
          <div className="grid grid-cols-5 gap-2">
            {OPERATORS.map((op) => (
              <motion.button key={op.id} whileTap={{ scale: 0.92 }} onClick={() => setOperator(op.id)}
                className={`relative flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border-2 transition-all duration-200 ${
                  operator === op.id
                    ? "border-[hsl(var(--emerald))] bg-[hsl(var(--emerald))]/8 shadow-lg shadow-[hsl(var(--emerald))]/15 scale-[1.03]"
                    : "border-border/40 bg-card/60 hover:border-[hsl(var(--emerald))]/30 hover:bg-card"
                }`}>
                {operator === op.id && (
                  <motion.div layoutId="operator-glow" className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[hsl(var(--emerald))]/10 to-[hsl(var(--cyan))]/5" />
                )}
                <img src={op.logo} alt={op.name} className="w-10 h-10 rounded-xl object-contain relative z-10" loading="lazy" width={40} height={40} />
                <span className={`text-[9px] font-bold relative z-10 text-center leading-tight ${
                  operator === op.id ? "text-[hsl(var(--emerald))]" : "text-muted-foreground"
                }`}>{op.name}</span>
                {operator === op.id && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[hsl(var(--emerald))] flex items-center justify-center z-20">
                    <CheckCircle className="w-3 h-3 text-white" />
                  </motion.div>
                )}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Phone Number */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <p className="text-[13px] font-black text-foreground mb-2.5 flex items-center gap-2">
            <span className="w-5 h-5 rounded-lg bg-[hsl(var(--cyan))]/15 flex items-center justify-center text-[10px]">২</span>
            মোবাইল নম্বর দিন
          </p>
          <div className="relative group">
            <div className="absolute left-0 top-0 bottom-0 w-14 rounded-l-2xl bg-gradient-to-r from-[hsl(var(--emerald))]/10 to-transparent flex items-center justify-center">
              <Phone className="h-4 w-4 text-[hsl(var(--emerald))]" />
            </div>
            <input type="tel" placeholder="01XXXXXXXXX" value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
              className="w-full pl-14 pr-4 py-4 rounded-2xl bg-card/80 border-2 border-border/40 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[hsl(var(--emerald))]/50 focus:shadow-lg focus:shadow-[hsl(var(--emerald))]/10 font-mono text-lg tracking-wider transition-all" />
            {phone.length === 11 && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[hsl(var(--emerald))]/15 flex items-center justify-center">
                <CheckCircle className="w-4 h-4 text-[hsl(var(--emerald))]" />
              </motion.div>
            )}
          </div>
          {phone.length > 0 && phone.length !== 11 && (
            <p className="text-[11px] text-destructive mt-1.5 font-medium ml-1">১১ ডিজিটের নম্বর দিন</p>
          )}
        </motion.div>

        {/* Amount Selection */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <p className="text-[13px] font-black text-foreground mb-2.5 flex items-center gap-2">
            <span className="w-5 h-5 rounded-lg bg-[hsl(var(--cyan))]/15 flex items-center justify-center text-[10px]">৩</span>
            রিচার্জ পরিমাণ
          </p>
          <div className="grid grid-cols-4 gap-2">
            {AMOUNTS.map((a) => {
              const keys = Math.ceil(a / RATE);
              const disabled = keys > currentKeys;
              return (
                <motion.button key={a} whileTap={!disabled ? { scale: 0.93 } : {}} disabled={disabled}
                  onClick={() => { setAmount(a); setCustomAmount(""); }}
                  className={`relative p-3 rounded-2xl border-2 text-center transition-all duration-200 ${
                    amount === a
                      ? "border-[hsl(var(--emerald))] bg-gradient-to-br from-[hsl(var(--emerald))]/12 to-[hsl(var(--cyan))]/8 shadow-md shadow-[hsl(var(--emerald))]/15"
                      : disabled
                        ? "border-border/20 bg-muted/20 opacity-40 cursor-not-allowed"
                        : "border-border/40 bg-card/60 hover:border-[hsl(var(--emerald))]/30 hover:bg-card"
                  }`}>
                  <span className={`text-xl font-black block ${
                    amount === a ? "text-[hsl(var(--emerald))]" : disabled ? "text-muted-foreground" : "text-foreground"
                  }`}>
                    {a}৳
                  </span>
                  <span className={`text-[9px] font-bold block mt-0.5 ${
                    amount === a ? "text-[hsl(var(--cyan))]" : "text-muted-foreground"
                  }`}>
                    {keys} Re-verify
                  </span>
                  {amount === a && (
                    <motion.div layoutId="amount-check" initial={{ scale: 0 }} animate={{ scale: 1 }}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[hsl(var(--emerald))] flex items-center justify-center">
                      <CheckCircle className="w-3 h-3 text-white" />
                    </motion.div>
                  )}
                </motion.button>
              );
            })}
          </div>
          <div className="mt-2.5">
            <input type="number" placeholder="অন্য পরিমাণ লিখুন..." value={customAmount}
              onChange={(e) => { setCustomAmount(e.target.value); setAmount(null); }}
              className="w-full px-4 py-3.5 rounded-2xl bg-card/80 border-2 border-border/40 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[hsl(var(--emerald))]/50 focus:shadow-lg focus:shadow-[hsl(var(--emerald))]/10 transition-all text-sm" />
          </div>
        </motion.div>

        {/* Summary Card */}
        <AnimatePresence>
          {finalAmount > 0 && (
            <motion.div initial={{ opacity: 0, height: 0, marginTop: 0 }} animate={{ opacity: 1, height: "auto", marginTop: 16 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              className="rounded-2xl border-2 border-[hsl(var(--cyan))]/20 bg-card/80 backdrop-blur-sm overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-[hsl(var(--cyan))]/8 to-transparent border-b border-border/20">
                <p className="text-[11px] font-black text-[hsl(var(--cyan))] uppercase tracking-wider">রিচার্জ সারসংক্ষেপ</p>
              </div>
              <div className="p-4 space-y-2.5">
                {selectedOp && (
                  <div className="flex justify-between items-center">
                    <span className="text-[12px] text-muted-foreground">অপারেটর</span>
                    <div className="flex items-center gap-2">
                      <img src={selectedOp.logo} alt="" className="w-5 h-5 rounded object-contain" />
                      <span className="text-[12px] font-bold">{selectedOp.name}</span>
                    </div>
                  </div>
                )}
                {phone.length === 11 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[12px] text-muted-foreground">নম্বর</span>
                    <span className="text-[12px] font-bold font-mono">{phone}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-muted-foreground">পরিমাণ</span>
                  <span className="text-[15px] font-black text-[hsl(var(--emerald))]">{finalAmount}৳</span>
                </div>
                <div className="h-px bg-border/30" />
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-muted-foreground">কাটবে</span>
                  <span className={`text-[13px] font-black ${keysNeeded > currentKeys ? "text-destructive" : "text-foreground"}`}>
                    {keysNeeded} কাউন্ট
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-muted-foreground">বাকি থাকবে</span>
                  <span className="text-[13px] font-black text-foreground">{Math.max(0, currentKeys - keysNeeded)} কাউন্ট</span>
                </div>
                {keysNeeded > currentKeys && (
                  <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2 mt-1">
                    <p className="text-[11px] font-bold text-destructive text-center">❌ পর্যাপ্ত কাউন্ট নেই!</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recharge Button */}
        <motion.button
          whileTap={canRecharge && !loading && !success ? { scale: 0.97 } : {}}
          disabled={!canRecharge || loading || success}
          onClick={handleRecharge}
          className={`w-full py-4.5 rounded-2xl font-black text-[16px] transition-all flex items-center justify-center gap-2.5 relative overflow-hidden ${
            success
              ? "bg-[hsl(var(--emerald))] text-white shadow-xl shadow-[hsl(var(--emerald))]/30"
              : canRecharge
                ? "text-white shadow-xl shadow-[hsl(var(--emerald))]/25 hover:shadow-2xl"
                : "bg-muted/50 text-muted-foreground cursor-not-allowed"
          }`}
          style={!success && canRecharge ? {
            background: "linear-gradient(135deg, hsl(var(--emerald)), hsl(var(--cyan)), hsl(var(--blue)))",
            backgroundSize: "200% 200%",
          } : undefined}
        >
          {canRecharge && !loading && !success && (
            <motion.div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent"
              animate={{ x: ["-100%", "200%"] }} transition={{ duration: 2, repeat: Infinity }} />
          )}
          <span className="relative z-10 flex items-center gap-2.5">
            {loading ? <><Loader2 className="h-5 w-5 animate-spin" /> রিচার্জ হচ্ছে...</>
              : success ? <><CheckCircle className="h-5 w-5" /> রিচার্জ সফল! ✅</>
              : <>⚡ এখনই রিচার্জ করুন {finalAmount > 0 ? `(${finalAmount}৳)` : ""}</>}
          </span>
        </motion.button>

        {/* Trust Badges */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="flex items-center justify-center gap-4 pt-1">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Shield className="w-3.5 h-3.5 text-[hsl(var(--emerald))]" />
            <span className="font-bold">১০০% নিরাপদ</span>
          </div>
          <div className="w-px h-3 bg-border/40" />
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Zap className="w-3.5 h-3.5 text-[hsl(var(--amber))]" />
            <span className="font-bold">২ সেকেন্ডে সফল</span>
          </div>
          <div className="w-px h-3 bg-border/40" />
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <CheckCircle className="w-3.5 h-3.5 text-[hsl(var(--cyan))]" />
            <span className="font-bold">অটো রিফান্ড</span>
          </div>
        </motion.div>

        {/* Info Card - Compact Premium */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="relative rounded-2xl border border-[hsl(var(--emerald))]/20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--emerald))]/6 via-transparent to-[hsl(var(--cyan))]/6" />
          <div className="relative p-4">
            <p className="text-[14px] font-black bg-gradient-to-r from-[hsl(var(--emerald))] to-[hsl(var(--cyan))] bg-clip-text text-transparent mb-3">
              💡 কিভাবে কাজ করে?
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: "🔑", text: `১ কাউন্ট = ${RATE}৳`, color: "from-[hsl(var(--emerald))] to-[hsl(var(--cyan))]" },
                { icon: "⚡", text: "সম্পূর্ণ অটোমেটিক", color: "from-[hsl(var(--amber))] to-[hsl(var(--orange))]" },
                { icon: "🔄", text: "ব্যর্থ = অটো রিফান্ড", color: "from-[hsl(var(--cyan))] to-[hsl(var(--blue))]" },
                { icon: "💰", text: `সর্বনিম্ন ${RATE}৳`, color: "from-[hsl(var(--purple))] to-[hsl(var(--pink))]" },
              ].map((item, i) => (
                <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + i * 0.08 }}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-card/60 border border-border/20">
                  <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center text-[11px] shrink-0`}>
                    {item.icon}
                  </div>
                  <p className="text-[11px] font-bold text-foreground/85 leading-tight">{item.text}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
