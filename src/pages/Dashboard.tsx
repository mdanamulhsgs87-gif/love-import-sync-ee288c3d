import { useState, useEffect } from "react";
import { copyToClipboard as copyText } from "@/lib/clipboard";
import { useAuth } from "@/hooks/use-auth";
import { KeySubmitter } from "@/components/KeySubmitter";
import { WithdrawForm } from "@/components/WithdrawForm";
import { User, Wallet, Copy, Check, Bell, Send, Loader2, ChevronDown, MessageCircle, Shield, Lock, Newspaper, Download, Sparkles, X, Play, MoreVertical, Settings, LogOut, FileText, KeyRound, Home, CreditCard, Smartphone, Clock, CheckCircle2, ArrowRight, Zap, Crown, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPublicSettings, updateUserPaymentStatus } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { createUserTransferRequest, getIncomingTransferRequests, submitIncomingTransferRequests, cancelIncomingRequest } from "@/lib/user-requests";
import { ReverifySection } from "@/components/ReverifySection";
import { ReferralCard } from "@/components/ReferralCard";
import { hasUserPosted } from "@/lib/feed-api";
import { AnnouncementPopup } from "@/components/AnnouncementPopup";
import { formatCountdown, getRemainingMilliseconds } from "@/lib/countdown";
import { getUnreadCount } from "@/lib/chat-api";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const DASHBOARD_TERMS = [
  "অ্যাপে কাজ করতে হলে নির্দিষ্ট অ্যাডমিনের মাধ্যমে কাজ শিখে নিতে হবে।",
  "সব ব্যবহারকারীকে অ্যাপের নিয়ম-কানুন ও কর্তৃপক্ষের সিদ্ধান্ত মানতে হবে।",
  "একটি ডিভাইসে একাধিক অ্যাকাউন্ট থাকলে নিয়ম ভাঙার ক্ষেত্রে অ্যাডমিন ব্যবস্থা নিতে পারেন।",
  "প্রতারণা, হ্যাকিং, বা অসৎভাবে ব্যালেন্স নেওয়ার চেষ্টা করলে অ্যাকাউন্ট বন্ধ হতে পারে।",
  "অ্যাপ কর্তৃপক্ষ প্রয়োজনে নিয়ম পরিবর্তন করতে পারে।",
];

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
};

export default function Dashboard() {
  const { user, logout, isLoading, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [skipPostPrompt, setSkipPostPrompt] = useState(() => localStorage.getItem("skipPostPrompt") === "1");

  // Active panel states (from 3-dot menu)
  const [activePanel, setActivePanel] = useState<"home" | "wallet" | "verified" | "request" | "settings">("home");
  const [walletSystem, setWalletSystem] = useState<"bdt" | "usdt">("bdt");

  // Request system states
  const [requestTargetNumber, setRequestTargetNumber] = useState("");
  const [requestPaymentMethod, setRequestPaymentMethod] = useState("bkash");
  const [requestPaymentNumber, setRequestPaymentNumber] = useState("");
  const [showRequestSubmitPassword, setShowRequestSubmitPassword] = useState(false);
  const [requestSubmitPassword, setRequestSubmitPassword] = useState("");
  const [submitterPaymentNumber, setSubmitterPaymentNumber] = useState("");
  const [submitterPaymentMethod, setSubmitterPaymentMethod] = useState("bkash");
  const [submitterRate, setSubmitterRate] = useState("");
  const [userRequestPassword, setUserRequestPassword] = useState("");
  const [nowMs, setNowMs] = useState(Date.now());
  const [prevKeyCount, setPrevKeyCount] = useState<number | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [loadedAppVersion, setLoadedAppVersion] = useState<number | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showRequestPasswordSetup, setShowRequestPasswordSetup] = useState(false);
  const [requestPasswordDraft, setRequestPasswordDraft] = useState("");
  const [requestPasswordConfirm, setRequestPasswordConfirm] = useState("");
  const [requestPasswordSaving, setRequestPasswordSaving] = useState(false);

  const { data: publicSettings } = useQuery({
    queryKey: ["public-settings"],
    queryFn: getPublicSettings,
    staleTime: 30000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 60000,
  });

  const { data: incomingRequests = [] } = useQuery({
    queryKey: ["incoming-user-transfer-requests", user?.guest_id],
    queryFn: () => getIncomingTransferRequests(user?.guest_id || ""),
    enabled: !!user?.guest_id,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const { data: userHasPosted = true } = useQuery({
    queryKey: ["user-has-posted", user?.id],
    queryFn: () => hasUserPosted(user!.id),
    enabled: !!user?.id,
    staleTime: 120000,
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => getUnreadCount(user!.id),
    enabled: !!user?.id,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const createUserRequestMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("ইউজার পাওয়া যায়নি");
      if (!userRequestPassword.trim()) throw new Error("Request পাসওয়ার্ড দিন");
      if ((user as any).request_password && userRequestPassword !== (user as any).request_password) {
        throw new Error("Request পাসওয়ার্ড ভুল হয়েছে");
      }
      let targetInput = requestTargetNumber.trim();
      if ((user as any).locked_target_guest_id) {
        targetInput = (user as any).locked_target_guest_id;
      }
      if (!targetInput) throw new Error("টার্গেট ইউজার দিন");
      const freshSettings = await getPublicSettings();
      const freshMinVerified = freshSettings.minRequestVerified || 10;
      if ((user.key_count || 0) < freshMinVerified) {
        throw new Error(`সর্বনিম্ন ${freshMinVerified} টি ভেরিফাইড কাউন্ট দরকার। আপনার আছে ${user.key_count || 0} টি।`);
      }
      let targetGuestId = targetInput;
      if (/^\d+$/.test(targetInput)) {
        const { data: targetUser } = await supabase.from("users").select("guest_id").eq("id", parseInt(targetInput)).maybeSingle();
        if (!targetUser) throw new Error("এই ID তে কোনো ইউজার পাওয়া যায়নি");
        targetGuestId = targetUser.guest_id;
      }
      await createUserTransferRequest({
        requesterUserId: user.id,
        requesterGuestId: user.guest_id,
        requesterVerifiedCount: user.key_count || 0,
        requesterPaymentNumber: requestPaymentNumber.trim(),
        requesterPaymentMethod: requestPaymentMethod,
        targetGuestId: targetGuestId,
      });
      const updates: Record<string, string> = {};
      if (!(user as any).request_password) updates.request_password = userRequestPassword.trim();
      if (!(user as any).locked_target_guest_id) updates.locked_target_guest_id = targetGuestId;
      if (Object.keys(updates).length > 0) {
        await supabase.from("users").update(updates as any).eq("id", user.id);
        await refreshUser();
      }
    },
    onSuccess: () => {
      setRequestPaymentNumber("");
      setUserRequestPassword("");
      toast({ title: "রিকুয়েস্ট পাঠানো হয়েছে" });
    },
    onError: (error: Error) => {
      toast({ title: "রিকুয়েস্ট পাঠানো যায়নি", description: error.message, variant: "destructive" });
    },
  });

  const submitIncomingRequestsMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("ইউজার পাওয়া যায়নি");
      const freshSettings = await getPublicSettings();
      const minTarget = freshSettings.minRequestTarget || 0;
      const freshMinVerified = freshSettings.minRequestVerified || 10;
      if (minTarget > 0 && incomingRequests.length < minTarget) {
        throw new Error(`সর্বনিম্ন ${minTarget} টি request দরকার, আপনার আছে ${incomingRequests.length} টি।`);
      }
      const belowMinRequests = incomingRequests.filter(r => (r.requester_verified_count || 0) < freshMinVerified);
      if (belowMinRequests.length > 0) {
        throw new Error(`${belowMinRequests.length} টি request এ verified count ${freshMinVerified} এর কম। ওইগুলো Cancel করুন তারপর submit করুন।`);
      }
      const rateToSubmit = parseInt(submitterRate) || 0;
      if (rateToSubmit <= 0) throw new Error("রেট লিখুন (সংখ্যা)");
      return submitIncomingTransferRequests(
        user.guest_id,
        user.display_name || user.guest_id,
        requestSubmitPassword,
        submitterPaymentNumber.trim() || undefined,
        submitterPaymentNumber.trim() ? submitterPaymentMethod : undefined,
        rateToSubmit
      );
    },
    onSuccess: () => {
      setShowRequestSubmitPassword(false);
      setRequestSubmitPassword("");
      setSubmitterPaymentNumber("");
      queryClient.invalidateQueries({ queryKey: ["incoming-user-transfer-requests", user?.guest_id] });
      queryClient.invalidateQueries({ queryKey: ["admin-submitted"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-request-submissions"] });
      toast({ title: "লিস্ট অ্যাডমিন প্যানেলে পাঠানো হয়েছে" });
    },
    onError: (error: Error) => {
      toast({ title: "সাবমিট ব্যর্থ হয়েছে", description: error.message, variant: "destructive" });
    },
  });

  const cancelIncomingRequestMutation = useMutation({
    mutationFn: async (requestId: number) => {
      if (!user) throw new Error("ইউজার পাওয়া যায়নি");
      return cancelIncomingRequest(requestId, user.guest_id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incoming-user-transfer-requests", user?.guest_id] });
      toast({ title: "Request বাতিল হয়েছে" });
    },
    onError: (error: Error) => {
      toast({ title: "বাতিল ব্যর্থ", description: error.message, variant: "destructive" });
    },
  });

  const paymentMutation = useMutation({
    mutationFn: async (received: boolean) => {
      if (!user) return;
      await updateUserPaymentStatus(user.id, received ? "received" : "not_received");
    },
    onSuccess: () => {
      refreshUser();
      toast({ title: "আপনার ফিডব্যাক জমা হয়েছে" });
    },
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 5000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!user) return;
    if ((user as any).request_password) {
      setShowRequestPasswordSetup(false);
      return;
    }
    setShowRequestPasswordSetup(true);
  }, [user]);

  useEffect(() => {
    if (user?.key_count != null) {
      if (prevKeyCount !== null && user.key_count > prevKeyCount) {
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 3000);
      }
      setPrevKeyCount(user.key_count);
    }
  }, [user?.key_count]);

  useEffect(() => {
    if (publicSettings?.appVersion != null) {
      if (loadedAppVersion === null) {
        setLoadedAppVersion(publicSettings.appVersion);
      } else if (publicSettings.appVersion !== loadedAppVersion) {
        window.location.reload();
      }
    }
  }, [publicSettings?.appVersion, loadedAppVersion]);

  useEffect(() => {
    if (!user?.id) return;
    const settingsChannel = supabase
      .channel('dashboard-settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () => {
        queryClient.invalidateQueries({ queryKey: ["public-settings"] });
      })
      .subscribe();
    const usersChannel = supabase
      .channel('dashboard-user')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: user ? `id=eq.${user.id}` : undefined }, () => {
        refreshUser();
      })
      .subscribe();
    const txChannel = supabase
      .channel('dashboard-transactions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: user ? `user_id=eq.${user.id}` : undefined }, () => {
        queryClient.invalidateQueries({ queryKey: ["user-transactions"] });
        refreshUser();
      })
      .subscribe();
    const requestsChannel = supabase
      .channel('dashboard-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_transfer_requests' }, () => {
        queryClient.invalidateQueries({ queryKey: ["incoming-user-transfer-requests", user?.guest_id] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(usersChannel);
      supabase.removeChannel(txChannel);
      supabase.removeChannel(requestsChannel);
    };
  }, [user?.id, queryClient, refreshUser]);

  const bonusEnabled = publicSettings?.bonusStatus === "on";
  const targetAmount = publicSettings?.bonusTarget || 10;
  const customNoticeText = publicSettings?.customNotice;
  const minRequestVerified = publicSettings?.minRequestVerified || 10;
  const minRequestTarget = publicSettings?.minRequestTarget || 0;
  const currentRate = publicSettings?.rewardRate || 0;
  const usdtToBdtRate = publicSettings?.usdtToBdtRate || 124;
  const reverifyCount = (user as any)?.reverify_count || 0;
  const usdtPaidCount = (user as any)?.usdt_paid_count || 0;
  const availableAccounts = Math.max(0, reverifyCount - usdtPaidCount);
  const referralUsdt = Number((user as any)?.referral_usdt_earnings || 0);
  const computedBdtBalance = availableAccounts * currentRate + Math.floor(referralUsdt * usdtToBdtRate);
  const userVerifiedCount = user?.key_count || 0;
  const canSendRequest = userVerifiedCount >= minRequestVerified;
  const belowMinIncoming = incomingRequests.filter(r => (r.requester_verified_count || 0) < minRequestVerified);
  const canSubmitList = (minRequestTarget <= 0 || incomingRequests.length >= minRequestTarget) && belowMinIncoming.length === 0;
  const requestLockRemainingMs = getRemainingMilliseconds(publicSettings?.requestLockUntil, nowMs);
  const isRequestLocked = requestLockRemainingMs > 0;
  const requestCountdownText = formatCountdown(requestLockRemainingMs);

  const copyId = () => {
    if (user?.id) {
      copyText(String(user.id));
      setCopied(true);
      toast({ title: "আইডি কপি হয়েছে" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSaveRequestPassword = async () => {
    if (!user) return;
    const nextPassword = requestPasswordDraft.trim();
    if (nextPassword.length < 4) {
      toast({ title: "পাসওয়ার্ড ছোট", description: "কমপক্ষে ৪ অক্ষরের পাসওয়ার্ড দিন", variant: "destructive" });
      return;
    }
    if (nextPassword !== requestPasswordConfirm.trim()) {
      toast({ title: "পাসওয়ার্ড মিলেনি", description: "দুইবার একই পাসওয়ার্ড লিখুন", variant: "destructive" });
      return;
    }
    setRequestPasswordSaving(true);
    try {
      await supabase.from("users").update({ request_password: nextPassword } as any).eq("id", user.id);
      setUserRequestPassword(nextPassword);
      setRequestPasswordDraft("");
      setRequestPasswordConfirm("");
      await refreshUser();
      setShowRequestPasswordSetup(false);
      toast({ title: "✅ পাসওয়ার্ড সেভ হয়েছে" });
    } catch (err: any) {
      toast({ title: "সেভ ব্যর্থ", description: err.message || "আবার চেষ্টা করুন", variant: "destructive" });
    } finally {
      setRequestPasswordSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm animate-pulse">লোড হচ্ছে...</p>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-background pb-24 relative">
      <AnnouncementPopup />
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-primary opacity-10 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-[hsl(var(--purple))] opacity-[0.07] rounded-full blur-[150px]" />
      </div>

      {/* Feed onboarding overlay */}
      <AnimatePresence>
        {!userHasPosted && !skipPostPrompt && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-background/95 backdrop-blur-md flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.8, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", damping: 20 }} className="w-full max-w-sm text-center space-y-6">
              <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 2, repeat: Infinity }}
                className="w-24 h-24 mx-auto rounded-3xl bg-gradient-to-br from-[hsl(var(--amber))] to-[hsl(var(--orange))] flex items-center justify-center shadow-2xl shadow-[hsl(var(--amber))]/30">
                <Newspaper className="w-12 h-12 text-background" />
              </motion.div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black">নিউজ ফিডে পোস্ট করুন! 🎉</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">অ্যাপ ব্যবহার করতে প্রথমে নিউজ ফিডে গিয়ে একটি পোস্ট করুন।</p>
              </div>
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => navigate("/feed")}
                className="w-full relative py-4 rounded-2xl font-black text-lg text-primary-foreground overflow-hidden">
                <motion.div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--amber))] via-[hsl(var(--orange))] to-[hsl(var(--pink))]"
                  animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} style={{ backgroundSize: "200% 100%" }} />
                <span className="relative z-10 flex items-center justify-center gap-2"><Sparkles className="w-5 h-5" /> নিউজ ফিডে যান</span>
              </motion.button>
              <button
                onClick={() => { localStorage.setItem("skipPostPrompt", "1"); setSkipPostPrompt(true); }}
                className="w-full text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
              >
                পরে করব
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment confirmation overlay */}
      <AnimatePresence>
        {user.payment_status === "pending" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="glass-card p-8 rounded-3xl w-full max-w-sm text-center space-y-6 border-2 border-primary/30 shadow-2xl shadow-primary/20">
              <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto"><Wallet className="w-10 h-10 text-primary" /></div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">পেমেন্ট পেয়েছেন?</h2>
                <p className="text-muted-foreground">আপনার পূর্বের কাজের পেমেন্ট কি বুঝে পেয়েছেন?</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => paymentMutation.mutate(true)} className="btn-primary bg-[hsl(var(--emerald))] h-14 text-lg font-black" disabled={paymentMutation.isPending}>হ্যাঁ</button>
                <button onClick={() => paymentMutation.mutate(false)} className="btn-primary bg-destructive h-14 text-lg font-black" disabled={paymentMutation.isPending}>না</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Request Password Setup Modal */}
      <AnimatePresence>
        {showRequestPasswordSetup && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[180] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 20 }}
              className="w-full max-w-md rounded-3xl border border-border/60 bg-card p-5 shadow-2xl">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(var(--purple))]/15 text-[hsl(var(--purple))]"><KeyRound className="h-6 w-6" /></div>
                <div>
                  <h2 className="text-lg font-black">রিকুয়েস্ট পাসওয়ার্ড সেটআপ</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">রিকুয়েস্ট পাঠাতে এই পাসওয়ার্ড লাগবে। একবার সেট করলে আর পরিবর্তন করা যাবে না।</p>
                </div>
              </div>
              <div className="space-y-3">
                <input type="password" value={requestPasswordDraft} onChange={(e) => setRequestPasswordDraft(e.target.value)}
                  placeholder="নতুন পাসওয়ার্ড লিখুন" className="input-field" autoFocus />
                <input type="password" value={requestPasswordConfirm} onChange={(e) => setRequestPasswordConfirm(e.target.value)}
                  placeholder="আবার একই পাসওয়ার্ড লিখুন" className="input-field" />
                <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
                  ⚠️ এই পাসওয়ার্ড কোথাও সুরক্ষিতভাবে সেভ রাখুন। হারালে শুধু অ্যাডমিন রিসেট করতে পারবে।
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowRequestPasswordSetup(false)}
                    className="flex-1 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-bold text-foreground">পরে করব</button>
                  <button type="button" onClick={handleSaveRequestPassword}
                    disabled={requestPasswordSaving || !requestPasswordDraft.trim() || !requestPasswordConfirm.trim()}
                    className="btn-primary flex-1 py-3 text-sm">
                    {requestPasswordSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "সেভ করুন"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Terms Modal */}
      <AnimatePresence>
        {showTermsModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[170] bg-background/80 backdrop-blur-sm p-4" onClick={() => setShowTermsModal(false)}>
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()} className="mx-auto mt-14 w-full max-w-md rounded-3xl border border-border/60 bg-card shadow-2xl">
              <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
                <div>
                  <h2 className="text-lg font-black">শর্তাবলী</h2>
                  <p className="text-[11px] text-muted-foreground">অ্যাপ ব্যবহার করার আগে এগুলো মানতে হবে</p>
                </div>
                <button onClick={() => setShowTermsModal(false)} className="rounded-xl p-2 text-muted-foreground hover:bg-secondary"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-3 px-5 py-4">
                {DASHBOARD_TERMS.map((term, index) => (
                  <div key={index} className="flex gap-3 rounded-2xl border border-border/40 bg-secondary/30 p-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-black text-primary">{index + 1}</div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{term}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => navigate("/profile")}
              className="w-11 h-11 bg-gradient-to-br from-primary/30 to-[hsl(var(--cyan))]/20 rounded-2xl flex items-center justify-center border border-primary/20 overflow-hidden">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="w-5 h-5 text-primary" />
              )}
            </motion.button>
            <div>
              <p className="font-bold text-sm truncate max-w-[140px]">{user.display_name || "Unknown"}</p>
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] text-muted-foreground font-mono">আইডি: {user.id}</p>
                <button onClick={copyId} className="p-0.5 hover:bg-secondary rounded transition-colors">
                  {copied ? <Check className="w-2.5 h-2.5 text-primary" /> : <Copy className="w-2.5 h-2.5 text-muted-foreground" />}
                </button>
              </div>
            </div>
          </div>

          {/* 3-dot menu with all features */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <motion.button
                animate={{ boxShadow: ["0 0 15px hsl(152 56% 38% / 0.3), 0 0 30px hsl(187 72% 50% / 0.15)", "0 0 25px hsl(152 56% 38% / 0.5), 0 0 50px hsl(187 72% 50% / 0.25)", "0 0 15px hsl(152 56% 38% / 0.3), 0 0 30px hsl(187 72% 50% / 0.15)"] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="flex h-13 w-13 items-center justify-center rounded-2xl border-2 border-[hsl(var(--cyan))]/50 text-foreground transition-transform hover:scale-[1.08] relative overflow-hidden"
                style={{ background: "linear-gradient(135deg, hsl(152 56% 30%), hsl(187 72% 40%), hsl(217 91% 50%))" }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[btn-shine_2s_ease-in-out_infinite]" />
                <MoreVertical className="h-6 w-6 text-white relative z-10 drop-shadow-lg" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] bg-destructive text-destructive-foreground text-[10px] font-black rounded-full flex items-center justify-center px-1 animate-pulse shadow-lg shadow-destructive/40">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </motion.button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 rounded-2xl border-primary/20 bg-card/98 p-2 backdrop-blur-xl shadow-2xl shadow-primary/10">
              {/* Navigation */}
              <DropdownMenuItem className="rounded-xl px-4 py-4 cursor-pointer hover:bg-primary/10" onClick={() => { setActivePanel("home"); }}>
                <Home className="mr-3 h-5 w-5 text-primary" />
                <span className="text-[15px] font-black text-foreground">🏠 হোম (ফেস ভেরিফাই)</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-xl px-4 py-4 cursor-pointer hover:bg-[hsl(var(--amber))]/10" onClick={() => navigate("/feed")}>
                <Newspaper className="mr-3 h-5 w-5 text-[hsl(var(--amber))]" />
                <span className="text-[15px] font-black text-foreground">📰 নিউজ ফিড</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-xl px-4 py-4 cursor-pointer hover:bg-[hsl(var(--emerald))]/10" onClick={() => navigate("/reels")}>
                <Play className="mr-3 h-5 w-5 text-[hsl(var(--emerald))]" />
                <span className="text-[15px] font-black text-foreground">🎬 ভিডিও দেখুন</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-xl px-4 py-4 cursor-pointer hover:bg-[hsl(var(--cyan))]/10 relative" onClick={() => navigate("/chat")}>
                <MessageCircle className="mr-3 h-5 w-5 text-[hsl(var(--cyan))]" />
                <span className="text-[15px] font-black text-foreground">💬 মেসেজ</span>
                {unreadCount > 0 && (
                  <span className="ml-auto min-w-[24px] h-[24px] bg-destructive text-destructive-foreground text-[11px] font-black rounded-full flex items-center justify-center px-1.5">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-border/40 my-1.5" />

              {/* Feature Panels */}
              <DropdownMenuItem className="rounded-xl px-4 py-4 cursor-pointer hover:bg-[hsl(var(--cyan))]/10" onClick={() => setActivePanel("wallet")}>
                <Wallet className="mr-3 h-5 w-5 text-[hsl(var(--cyan))]" />
                <span className="text-[15px] font-black text-foreground">💰 ওয়ালেট ও উইথড্র</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-xl px-4 py-4 cursor-pointer hover:bg-[hsl(var(--emerald))]/10" onClick={() => navigate("/mobile-recharge")}>
                <Smartphone className="mr-3 h-5 w-5 text-[hsl(var(--emerald))]" />
                <span className="text-[15px] font-black text-foreground">📱 মোবাইল রিচার্জ</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-border/40 my-1.5" />

              {/* Settings & Others */}
              <DropdownMenuItem className="rounded-xl px-4 py-4 cursor-pointer hover:bg-[hsl(var(--amber))]/10" onClick={() => setActivePanel("settings")}>
                <Settings className="mr-3 h-5 w-5 text-[hsl(var(--amber))]" />
                <span className="text-[15px] font-black text-foreground">⚙️ সেটিংস</span>
              </DropdownMenuItem>
              {!(user as any).request_password && (
                <DropdownMenuItem className="rounded-xl px-4 py-4 cursor-pointer hover:bg-[hsl(var(--purple))]/10" onClick={() => setShowRequestPasswordSetup(true)}>
                  <KeyRound className="mr-3 h-5 w-5 text-[hsl(var(--purple))]" />
                  <span className="text-[15px] font-black text-foreground">🔐 রিকুয়েস্ট পাসওয়ার্ড</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="rounded-xl px-4 py-4 cursor-pointer hover:bg-[hsl(var(--amber))]/10" onClick={() => setShowTermsModal(true)}>
                <FileText className="mr-3 h-5 w-5 text-[hsl(var(--amber))]" />
                <span className="text-[15px] font-black text-foreground">📋 শর্তাবলী</span>
              </DropdownMenuItem>
              {!window.matchMedia("(display-mode: standalone)").matches && (
                <DropdownMenuItem className="rounded-xl px-4 py-4 cursor-pointer hover:bg-[hsl(var(--emerald))]/10" onClick={() => navigate("/install")}>
                  <Download className="mr-3 h-5 w-5 text-[hsl(var(--emerald))]" />
                  <span className="text-[15px] font-black text-foreground">📲 অ্যাপ ইনস্টল</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator className="bg-border/40 my-1.5" />
              <DropdownMenuItem className="rounded-xl px-4 py-4 cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive" onClick={handleLogout}>
                <LogOut className="mr-3 h-5 w-5" />
                <span className="text-[15px] font-black">🚪 লগআউট</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4 space-y-5 relative z-10">

        {/* ========== HOME PANEL: Face Verification Only ========== */}
        {activePanel === "home" && (
          <>
            {/* Verification Status — Premium 3-stat panel */}
            {(() => {
              const totalCount = user.key_count || 0;
              const completeCount = (user as any).reverify_count || 0;
              const pendingCount = Math.max(0, totalCount - completeCount);
              const progressPct = totalCount > 0 ? Math.round((completeCount / totalCount) * 100) : 0;
              return (
            <motion.div custom={-0.5} variants={cardVariants} initial="hidden" animate="visible"
              className="relative rounded-[28px] p-[1.5px] overflow-hidden shadow-[0_20px_60px_-15px_hsl(var(--purple)/0.5)]">
              {/* Rotating conic gradient border */}
              <motion.div
                className="absolute inset-0 rounded-[28px]"
                style={{ background: "conic-gradient(from 0deg, hsl(var(--purple)), hsl(var(--cyan)), hsl(var(--emerald)), hsl(var(--amber)), hsl(var(--pink)), hsl(var(--purple)))" }}
                animate={{ rotate: 360 }}
                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
              />
              <div className="relative rounded-[27px] glass-card overflow-hidden">
                {/* Animated aurora background */}
                <motion.div className="pointer-events-none absolute -inset-1 opacity-70"
                  style={{ background: "radial-gradient(60% 60% at 20% 0%, hsl(var(--purple)/0.25), transparent 60%), radial-gradient(60% 60% at 100% 100%, hsl(var(--cyan)/0.20), transparent 60%), radial-gradient(50% 60% at 50% 50%, hsl(var(--amber)/0.14), transparent 70%)" }}
                  animate={{ opacity: [0.5, 0.95, 0.5] }} transition={{ duration: 5, repeat: Infinity }} />
                {/* Floating sparkles */}
                {[...Array(6)].map((_, i) => (
                  <motion.div key={i} className="pointer-events-none absolute"
                    style={{ left: `${10 + i * 15}%`, top: `${15 + (i % 3) * 25}%` }}
                    animate={{ y: [0, -8, 0], opacity: [0.2, 0.9, 0.2], scale: [0.6, 1, 0.6] }}
                    transition={{ duration: 2.5 + i * 0.4, repeat: Infinity, delay: i * 0.3 }}>
                    <Sparkles className="w-2.5 h-2.5 text-[hsl(var(--amber))]" />
                  </motion.div>
                ))}
                <div className="relative z-10 p-5">
                {/* Header — Premium Crown */}
                <div className="w-full flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {/* Ultra-premium 3D crown badge */}
                    <div className="relative w-14 h-14 shrink-0">
                      {/* Outer pulsing aura */}
                      <motion.div
                        className="absolute -inset-2 rounded-[20px] blur-xl"
                        style={{ background: "radial-gradient(circle, hsl(var(--amber)/0.6), hsl(var(--orange)/0.3), transparent 70%)" }}
                        animate={{ scale: [1, 1.25, 1], opacity: [0.6, 1, 0.6] }}
                        transition={{ duration: 2.2, repeat: Infinity }}
                      />
                      {/* Rotating conic ring */}
                      <motion.div
                        className="absolute inset-0 rounded-[18px] p-[2px]"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                        style={{ background: "conic-gradient(from 0deg, hsl(var(--amber)), hsl(var(--orange)), hsl(var(--pink)), hsl(var(--purple)), hsl(var(--cyan)), hsl(var(--amber)))" }}
                      >
                        <div className="w-full h-full rounded-[16px] bg-background" />
                      </motion.div>
                      {/* Inner gold gradient */}
                      <div className="absolute inset-[3px] rounded-[15px] bg-gradient-to-br from-[hsl(45,95%,55%)] via-[hsl(35,90%,50%)] to-[hsl(25,85%,40%)] flex items-center justify-center overflow-hidden shadow-[inset_0_2px_8px_rgba(255,255,255,0.4),inset_0_-2px_8px_rgba(0,0,0,0.3)]">
                        {/* Shine sweep */}
                        <motion.div
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent"
                          animate={{ x: ["-150%", "150%"] }}
                          transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                        />
                        {/* Crown with bounce + glow */}
                        <motion.div
                          animate={{ y: [0, -2, 0], rotate: [0, -5, 5, 0] }}
                          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                          className="relative z-10"
                        >
                          <Crown
                            className="w-7 h-7 text-white"
                            fill="white"
                            strokeWidth={2.2}
                            style={{ filter: "drop-shadow(0 0 6px rgba(255,255,255,0.9)) drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}
                          />
                        </motion.div>
                        {/* Mini sparkles inside */}
                        {[...Array(3)].map((_, i) => (
                          <motion.div
                            key={i}
                            className="absolute w-1 h-1 bg-white rounded-full"
                            style={{ left: `${20 + i * 28}%`, top: `${15 + i * 20}%` }}
                            animate={{ scale: [0, 1.5, 0], opacity: [0, 1, 0] }}
                            transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.5 }}
                          />
                        ))}
                      </div>
                      {/* Pending notif dot */}
                      {pendingCount > 0 && (
                        <motion.span
                          className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-gradient-to-br from-[hsl(var(--pink))] to-destructive border-2 border-background flex items-center justify-center text-[10px] font-black text-white shadow-[0_0_12px_hsl(var(--pink))]"
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 1, repeat: Infinity }}
                        >
                          {pendingCount}
                        </motion.span>
                      )}
                    </div>
                    <div className="text-left">
                      <p className="text-[15px] font-black bg-gradient-to-r from-[hsl(var(--amber))] via-[hsl(var(--pink))] to-[hsl(var(--cyan))] bg-clip-text text-transparent"
                        style={{ backgroundSize: "200% auto", animation: "shimmer-text 3s linear infinite" }}>
                        ✨ ভেরিফিকেশন স্ট্যাটাস
                      </p>
                      <p className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
                        <TrendingUp className="w-2.5 h-2.5 text-[hsl(var(--emerald))]" />
                        {progressPct}% Complete
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2 stat segments — Pending & Complete only */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {/* Pending */}
                  <div className={`relative rounded-2xl p-3 bg-gradient-to-br from-[hsl(var(--amber))]/20 to-[hsl(var(--orange))]/12 border border-[hsl(var(--amber))]/45 overflow-hidden ${pendingCount > 0 ? "shadow-[0_0_25px_-5px_hsl(var(--amber)/0.55)]" : ""}`}>
                    {pendingCount > 0 && (
                      <>
                        <motion.div className="absolute inset-0 bg-[hsl(var(--amber))]/10"
                          animate={{ opacity: [0, 0.7, 0] }} transition={{ duration: 2, repeat: Infinity }} />
                        <motion.div className="absolute -inset-1 bg-gradient-to-r from-transparent via-[hsl(var(--amber))]/25 to-transparent"
                          animate={{ x: ["-100%", "200%"] }} transition={{ duration: 2.8, repeat: Infinity, ease: "linear" }} />
                      </>
                    )}
                    <div className="relative flex items-center gap-1 mb-1">
                      <Clock className="w-3 h-3 text-[hsl(var(--amber))]" />
                      <p className="text-[9px] font-black text-[hsl(var(--amber))] uppercase tracking-wider">Pending</p>
                    </div>
                    <motion.p key={`p-${pendingCount}`} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 260, damping: 18 }}
                      className="relative text-4xl font-black text-[hsl(var(--amber))] leading-none drop-shadow-[0_0_8px_hsl(var(--amber)/0.6)]">{pendingCount}</motion.p>
                    <p className="relative text-[9px] text-muted-foreground mt-1 font-semibold">Re-verify দরকার</p>
                  </div>
                  {/* Complete */}
                  <div className="relative rounded-2xl p-3 bg-gradient-to-br from-[hsl(var(--emerald))]/20 to-[hsl(var(--cyan))]/12 border border-[hsl(var(--emerald))]/45 overflow-hidden shadow-[0_0_20px_-8px_hsl(var(--emerald)/0.4)]">
                    <div className="relative flex items-center gap-1 mb-1">
                      <CheckCircle2 className="w-3 h-3 text-[hsl(var(--emerald))]" />
                      <p className="text-[9px] font-black text-[hsl(var(--emerald))] uppercase tracking-wider">Success</p>
                    </div>
                    <motion.p key={`c-${completeCount}`} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 260, damping: 18 }}
                      className="relative text-4xl font-black text-[hsl(var(--emerald))] leading-none drop-shadow-[0_0_8px_hsl(var(--emerald)/0.5)]">{completeCount}</motion.p>
                    <p className="relative text-[9px] text-muted-foreground mt-1 font-semibold">টাকা যোগ হয়েছে</p>
                  </div>
                </div>

                {/* CTA — only if pending exists */}
                {pendingCount > 0 && (
                  <motion.button
                    onClick={() => {
                      const section = document.getElementById("reverify-section");
                      section?.scrollIntoView({ behavior: "smooth", block: "center" });
                      // Highlight the re-verify start button to nudge the user
                      setTimeout(() => {
                        const btn = document.getElementById("reverify-start-btn");
                        if (btn) {
                          btn.classList.add("reverify-pulse-attention");
                          setTimeout(() => btn.classList.remove("reverify-pulse-attention"), 4200);
                        }
                        toast({
                          title: "👇 এই বাটনে ক্লিক করুন",
                          description: "ফেস স্ক্যান করে রি-ভেরিফাই শুরু করুন — Account Complete হবে ও টাকা যোগ হবে।",
                        });
                      }, 600);
                    }}
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    className="relative w-full overflow-hidden rounded-2xl p-[1.5px] bg-gradient-to-r from-[hsl(var(--amber))] via-[hsl(var(--orange))] to-[hsl(var(--amber))] shadow-[0_0_24px_hsl(var(--amber)/0.45)]">
                    <motion.div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--amber))]/0 via-white/30 to-[hsl(var(--amber))]/0"
                      animate={{ x: ["-100%", "200%"] }} transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }} />
                    <div className="relative flex items-center justify-center gap-2 rounded-2xl bg-background/90 backdrop-blur-sm px-4 py-3">
                      <Zap className="w-4 h-4 text-[hsl(var(--amber))]" fill="currentColor" />
                      <span className="text-sm font-black bg-gradient-to-r from-[hsl(var(--amber))] to-[hsl(var(--orange))] bg-clip-text text-transparent">
                        এখনই Re-verify করে {pendingCount}টি Complete করুন
                      </span>
                      <ArrowRight className="w-4 h-4 text-[hsl(var(--orange))]" />
                    </div>
                  </motion.button>
                )}
                {pendingCount === 0 && totalCount > 0 && (
                  <div className="flex items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--emerald))]/10 border border-[hsl(var(--emerald))]/30 px-4 py-2.5">
                    <CheckCircle2 className="w-4 h-4 text-[hsl(var(--emerald))]" />
                    <span className="text-xs font-black text-[hsl(var(--emerald))]">সব অ্যাকাউন্ট Complete ✨</span>
                  </div>
                )}
                </div>
              </div>
            </motion.div>
              );
            })()}

            {/* Re-verify Balance Card (compact) */}
            <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible"
              className="glass-card rounded-3xl border border-[hsl(var(--cyan))]/25 relative overflow-hidden">
              <motion.div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[hsl(var(--cyan))]/8 via-[hsl(var(--emerald))]/5 to-[hsl(var(--purple))]/8"
                animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 4, repeat: Infinity }} />
              <div className="relative z-10 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[hsl(var(--cyan))]/30 to-[hsl(var(--emerald))]/25 flex items-center justify-center border border-[hsl(var(--cyan))]/30">
                      <Wallet className="w-5 h-5 text-[hsl(var(--cyan))]" />
                    </div>
                    <div>
                      <p className="text-sm font-black bg-gradient-to-r from-[hsl(var(--cyan))] via-[hsl(var(--emerald))] to-[hsl(var(--amber))] bg-clip-text text-transparent">রি-ভেরিফাই আয়</p>
                      <p className="text-xs font-bold text-[hsl(var(--amber))]">💰 {currentRate} টাকা/রি-ভেরিফাই</p>
                    </div>
                  </div>
                  <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                    <p className="text-4xl font-black bg-gradient-to-r from-[hsl(var(--amber))] via-[hsl(var(--cyan))] to-[hsl(var(--emerald))] bg-clip-text text-transparent drop-shadow-lg">
                      {computedBdtBalance}<span className="text-lg ml-1 font-black text-[hsl(var(--amber))]">৳</span>
                    </p>
                  </motion.div>
                </div>
                <div className="mt-3 text-center bg-gradient-to-r from-[hsl(var(--cyan))]/10 via-[hsl(var(--emerald))]/10 to-[hsl(var(--amber))]/10 rounded-xl py-2 px-3 border border-[hsl(var(--cyan))]/20">
                  <p className="text-[11px] font-bold text-foreground/80">
                    ✅ শুধুমাত্র Re-verify সম্পন্ন হলে Account Complete হয় এবং Balance যোগ হয় — সরাসরি Withdraw বা Mobile Recharge করা যাবে
                  </p>
                </div>
              </div>
            </motion.div>

            {/* 📱 Mobile Recharge Promo Banner */}
            <motion.div custom={0.5} variants={cardVariants} initial="hidden" animate="visible"
              onClick={() => navigate("/mobile-recharge")}
              className="cursor-pointer group relative overflow-hidden rounded-3xl border-2 border-[hsl(var(--emerald))]/40 shadow-lg shadow-[hsl(var(--emerald))]/10">
              <motion.div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--emerald))]/15 via-[hsl(var(--cyan))]/10 to-[hsl(var(--blue))]/15"
                animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 3, repeat: Infinity }} />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[btn-shine_3s_ease-in-out_infinite]" />
              <div className="relative z-10 p-5">
                <div className="flex items-center gap-4">
                  <motion.div animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 2.5, repeat: Infinity }}
                    className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[hsl(var(--emerald))] to-[hsl(var(--cyan))] flex items-center justify-center shadow-xl shadow-[hsl(var(--emerald))]/30">
                    <Smartphone className="w-7 h-7 text-white" />
                  </motion.div>
                  <div className="flex-1">
                    <h3 className="text-[17px] font-black bg-gradient-to-r from-[hsl(var(--emerald))] via-[hsl(var(--cyan))] to-[hsl(var(--blue))] bg-clip-text text-transparent leading-tight">
                      ⚡ তাৎক্ষণিক মোবাইল রিচার্জ
                    </h3>
                    <p className="text-[12px] font-bold text-foreground/70 mt-1 leading-relaxed">
                      কোনো অ্যাডমিনের অনুমোদনের দরকার নেই! মাত্র <span className="text-[hsl(var(--emerald))] font-black">২ সেকেন্ডে</span> আপনার রিচার্জ সফল হবে ✅
                    </p>
                    <p className="text-[11px] text-[hsl(var(--amber))] font-bold mt-1">
                      💡 ১ Re-verify সম্পন্ন Account = {currentRate} টাকা রিচার্জ
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-center gap-2 bg-gradient-to-r from-[hsl(var(--emerald))] to-[hsl(var(--cyan))] rounded-xl py-2.5 group-hover:opacity-90 transition-opacity">
                  <Smartphone className="w-4 h-4 text-white" />
                  <span className="text-[13px] font-black text-white tracking-wide">এখনই রিচার্জ করুন →</span>
                </div>
              </div>
            </motion.div>

            {/* Custom Notice */}
            <AnimatePresence>
              {customNoticeText && (
                <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible"
                  className="relative overflow-hidden rounded-2xl border border-[hsl(var(--amber))]/30">
                  <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--amber))]/10 to-[hsl(var(--orange))]/5" />
                  <div className="relative p-4 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[hsl(var(--amber))]/20 flex items-center justify-center shrink-0">
                      <Bell className="w-4 h-4 text-[hsl(var(--amber))]" />
                    </div>
                    <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap">{customNoticeText}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Face Verification Section - RE-VERIFY */}
            <motion.div id="reverify-section" custom={1.5} variants={cardVariants} initial="hidden" animate="visible">
              <ReverifySection />
            </motion.div>

            {/* First Time Verification - KEY SUBMIT */}
            <motion.div custom={2} variants={cardVariants} initial="hidden" animate="visible">
              <KeySubmitter />
            </motion.div>

            {/* Referral / Reffer & Earn */}
            <motion.div custom={2.5} variants={cardVariants} initial="hidden" animate="visible">
              <ReferralCard />
            </motion.div>
          </>
        )}

        {/* ========== WALLET PANEL ========== */}
        {activePanel === "wallet" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <button onClick={() => setActivePanel("home")} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors">
              ← হোমে ফিরুন
            </button>
            <div className="glass-card rounded-3xl border border-[hsl(var(--cyan))]/25 overflow-hidden">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[hsl(var(--cyan))]/30 to-[hsl(var(--emerald))]/25 flex items-center justify-center border border-[hsl(var(--cyan))]/30">
                    <Wallet className="w-6 h-6 text-[hsl(var(--cyan))]" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black">আমার ওয়ালেট</h2>
                    <p className="text-[10px] text-muted-foreground">রি-ভেরিফাই আয় থেকে সরাসরি উইথড্র করুন</p>
                  </div>
                </div>
                <WithdrawForm
                  balance={computedBdtBalance}
                  onSystemChange={setWalletSystem}
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* ========== REQUEST PANEL ========== */}
        {activePanel === "request" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <button onClick={() => setActivePanel("home")} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors">
              ← হোমে ফিরুন
            </button>

            <div className="glass-card rounded-3xl border border-[hsl(var(--cyan))]/25 overflow-hidden">
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[hsl(var(--cyan))] to-[hsl(var(--blue))] flex items-center justify-center shadow-lg shadow-[hsl(var(--cyan))]/30">
                    <Send className="w-6 h-6 text-foreground" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black">💸 পেমেন্ট রিকুয়েস্ট</h2>
                    <p className="text-[10px] text-muted-foreground">প্রথম ভেরিফিকেশনের পেমেন্ট নিতে রিকুয়েস্ট পাঠান</p>
                  </div>
                </div>

                <div className="bg-[hsl(var(--amber))]/10 border border-[hsl(var(--amber))]/20 rounded-xl p-4 space-y-2">
                  <p className="text-xs text-foreground/80 leading-relaxed">
                    রিকুয়েস্ট পাঠাতে সর্বনিম্ন <span className="text-[hsl(var(--amber))] font-black">{minRequestVerified}</span> টি ভেরিফাইড কাউন্ট দরকার।
                  </p>
                  {bonusEnabled && (
                    <p className="text-xs text-foreground/80">৫০ টি = ২০% বোনাস</p>
                  )}
                </div>

                {isRequestLocked ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">রিকুয়েস্ট সিস্টেম চালু হবে</p>
                    <p className="text-2xl font-black text-destructive tracking-wide">{requestCountdownText}</p>
                  </div>
                ) : !canSendRequest ? (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-center">
                    <p className="text-sm text-destructive font-bold">{userVerifiedCount} / {minRequestVerified} ভেরিফাইড</p>
                    <p className="text-[10px] text-muted-foreground mt-1">সর্বনিম্ন {minRequestVerified} টি হলেই পাঠাতে পারবেন</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(user as any).locked_target_guest_id ? (
                      <div className="bg-primary/10 border border-primary/20 rounded-xl p-3">
                        <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><Lock className="w-3 h-3" /> লক করা টার্গেট</p>
                        <p className="text-sm font-mono font-black text-primary">{(user as any).locked_target_guest_id}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">অন্যকে রিকুয়েস্ট দিতে অ্যাডমিন থেকে আনলক করতে হবে</p>
                      </div>
                    ) : (
                      <input type="text" value={requestTargetNumber} onChange={(e) => setRequestTargetNumber(e.target.value)}
                        placeholder="যার কাছে রিকুয়েস্ট যাবে (User ID দিন)" className="input-field" />
                    )}
                    {(user as any).request_password ? (
                      <div className="bg-[hsl(var(--purple))]/10 border border-[hsl(var(--purple))]/20 rounded-xl p-3 space-y-2">
                        <p className="text-xs font-bold text-[hsl(var(--purple))] flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> রিকুয়েস্ট পাসওয়ার্ড</p>
                        <input type="password" value={userRequestPassword} onChange={(e) => setUserRequestPassword(e.target.value)}
                          placeholder="আপনার পাসওয়ার্ড দিন..." className="input-field" />
                      </div>
                    ) : (
                      <div className="rounded-xl border border-[hsl(var(--purple))]/20 bg-[hsl(var(--purple))]/10 p-4 space-y-3">
                        <p className="text-sm font-black text-[hsl(var(--purple))]">পাসওয়ার্ড সেট করা হয়নি</p>
                        <p className="text-[11px] text-muted-foreground">প্রথমে পাসওয়ার্ড সেটআপ করুন।</p>
                        <button type="button" onClick={() => setShowRequestPasswordSetup(true)} className="btn-primary py-3 text-sm">
                          <KeyRound className="h-4 w-4" /> পাসওয়ার্ড সেটআপ করুন
                        </button>
                      </div>
                    )}
                    <div className="bg-secondary/30 p-4 rounded-xl border border-border/50 space-y-3">
                      <p className="text-sm font-bold">আপনার পেমেন্ট নম্বর</p>
                      <div className="grid grid-cols-2 gap-2 bg-secondary/50 p-1 rounded-xl border border-border/50">
                        <motion.button onClick={() => setRequestPaymentMethod("bkash")} whileTap={{ scale: 0.9 }}
                          className={`px-4 py-2.5 rounded-lg text-xs font-black transition-all relative overflow-hidden ${requestPaymentMethod === "bkash" ? "text-foreground shadow-lg" : "text-muted-foreground"}`}>
                          {requestPaymentMethod === "bkash" && <motion.div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--pink))] to-[hsl(340,80%,55%)]" layoutId="req-pm-bg" transition={{ type: "spring", bounce: 0.2 }} />}
                          <span className="relative z-10">bKash</span>
                        </motion.button>
                        <motion.button onClick={() => setRequestPaymentMethod("nagad")} whileTap={{ scale: 0.9 }}
                          className={`px-4 py-2.5 rounded-lg text-xs font-black transition-all relative overflow-hidden ${requestPaymentMethod === "nagad" ? "text-foreground shadow-lg" : "text-muted-foreground"}`}>
                          {requestPaymentMethod === "nagad" && <motion.div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--orange))] to-[hsl(25,85%,55%)]" layoutId="req-pm-bg" transition={{ type: "spring", bounce: 0.2 }} />}
                          <span className="relative z-10">Nagad</span>
                        </motion.button>
                      </div>
                      <input type="text" placeholder="01XXXXXXXXX" value={requestPaymentNumber}
                        onChange={(e) => setRequestPaymentNumber(e.target.value)} className="input-field" />
                    </div>
                    <motion.button whileTap={{ scale: 0.92 }} onClick={() => createUserRequestMutation.mutate()}
                      className="w-full relative py-3.5 rounded-2xl font-black overflow-hidden"
                      disabled={isRequestLocked || createUserRequestMutation.isPending || !(user as any).request_password || (!(user as any).locked_target_guest_id && !requestTargetNumber.trim()) || !requestPaymentNumber.trim() || !userRequestPassword.trim()}>
                      <motion.div className="absolute inset-0 bg-gradient-to-r from-primary via-[hsl(var(--cyan))] to-primary"
                        animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} style={{ backgroundSize: "200% 100%" }} />
                      <span className="relative z-10 flex items-center justify-center gap-2 text-primary-foreground">
                        {createUserRequestMutation.isPending ? <Loader2 className="animate-spin w-5 h-5" /> : <><Send className="w-4 h-4" /> রিকুয়েস্ট পাঠান</>}
                      </span>
                    </motion.button>
                  </div>
                )}

                {/* Incoming Requests */}
                <div className="border-t border-border/50 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">আসা রিকুয়েস্ট ({incomingRequests.length})</h3>
                    {minRequestTarget > 0 && (
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${canSubmitList ? "bg-[hsl(var(--emerald))]/20 text-[hsl(var(--emerald))]" : "bg-destructive/20 text-destructive"}`}>
                        {incomingRequests.length}/{minRequestTarget} টার্গেট
                      </span>
                    )}
                  </div>
                  {incomingRequests.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">কোনো রিকুয়েস্ট আসেনি</p>
                  ) : (
                    <>
                      {belowMinIncoming.length > 0 && (
                        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-center">
                          <p className="text-xs font-bold text-destructive">⚠️ {belowMinIncoming.length} টি রিকুয়েস্টে ভেরিফিকেশন কম</p>
                          <p className="text-[10px] text-muted-foreground mt-1">ওইগুলো বাতিল করুন তারপর সাবমিট দিন</p>
                        </div>
                      )}
                      {minRequestTarget > 0 && incomingRequests.length < minRequestTarget && (
                        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-center">
                          <p className="text-xs font-bold text-destructive">সর্বনিম্ন {minRequestTarget} টি রিকুয়েস্ট দরকার</p>
                        </div>
                      )}
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {incomingRequests.map((item) => (
                          <div key={item.id} className={`rounded-xl p-3.5 space-y-2 ${(item.requester_verified_count || 0) < minRequestVerified ? "bg-destructive/10 border-2 border-destructive/40" : "bg-secondary/30 border border-border/50"}`}>
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-bold font-mono">আইডি: {item.requester_user_id}</p>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-primary/20 text-primary">{item.requester_verified_count} ✓</span>
                                <button onClick={() => cancelIncomingRequestMutation.mutate(item.id)} disabled={cancelIncomingRequestMutation.isPending}
                                  className="p-1 rounded-lg bg-destructive/15 hover:bg-destructive/25 text-destructive transition-colors">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${item.requester_payment_method === "bkash" ? "bg-[hsl(var(--pink))]/20 text-[hsl(var(--pink))]" : "bg-[hsl(var(--orange))]/20 text-[hsl(var(--orange))]"}`}>
                                {item.requester_payment_method?.toUpperCase() || "N/A"}
                              </span>
                              <span className="text-xs font-mono font-bold">{item.requester_payment_number}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {showRequestSubmitPassword ? (
                        <div className="space-y-3 bg-secondary/20 p-4 rounded-xl border border-border/50">
                          <input type="password" value={requestSubmitPassword} onChange={(e) => setRequestSubmitPassword(e.target.value)}
                            placeholder="পাসওয়ার্ড দিন" className="input-field" />
                          <div className="bg-[hsl(var(--amber))]/10 border border-[hsl(var(--amber))]/20 rounded-xl p-3 space-y-2">
                            <p className="text-xs font-bold text-[hsl(var(--amber))]">💰 রেট লিখুন</p>
                            <input type="number" value={submitterRate} onChange={(e) => setSubmitterRate(e.target.value)}
                              placeholder="যেমন: 35" className="input-field text-center text-lg font-black" />
                          </div>
                          <div className="bg-secondary/30 p-3 rounded-xl border border-border/50 space-y-3">
                            <p className="text-xs font-bold">আপনার bKash/Nagad নম্বর</p>
                            <div className="grid grid-cols-2 gap-2 bg-secondary/50 p-1 rounded-xl border border-border/50">
                              <motion.button onClick={() => setSubmitterPaymentMethod("bkash")} whileTap={{ scale: 0.9 }}
                                className={`px-3 py-2.5 rounded-lg text-xs font-black transition-all relative overflow-hidden ${submitterPaymentMethod === "bkash" ? "text-foreground shadow-lg" : "text-muted-foreground"}`}>
                                {submitterPaymentMethod === "bkash" && <motion.div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--pink))] to-[hsl(340,80%,55%)]" layoutId="sub-pm-bg" transition={{ type: "spring", bounce: 0.2 }} />}
                                <span className="relative z-10">bKash</span>
                              </motion.button>
                              <motion.button onClick={() => setSubmitterPaymentMethod("nagad")} whileTap={{ scale: 0.9 }}
                                className={`px-3 py-2.5 rounded-lg text-xs font-black transition-all relative overflow-hidden ${submitterPaymentMethod === "nagad" ? "text-foreground shadow-lg" : "text-muted-foreground"}`}>
                                {submitterPaymentMethod === "nagad" && <motion.div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--orange))] to-[hsl(25,85%,55%)]" layoutId="sub-pm-bg" transition={{ type: "spring", bounce: 0.2 }} />}
                                <span className="relative z-10">Nagad</span>
                              </motion.button>
                            </div>
                            <input type="text" placeholder="01XXXXXXXXX" value={submitterPaymentNumber}
                              onChange={(e) => setSubmitterPaymentNumber(e.target.value)} className="input-field" />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <motion.button whileTap={{ scale: 0.92 }} onClick={() => submitIncomingRequestsMutation.mutate()}
                              className="relative py-3 rounded-xl font-black text-sm overflow-hidden"
                              disabled={isRequestLocked || submitIncomingRequestsMutation.isPending || !requestSubmitPassword || !submitterPaymentNumber.trim() || !submitterRate.trim() || !canSubmitList}>
                              <motion.div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--emerald))] via-primary to-[hsl(var(--emerald))]"
                                animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} style={{ backgroundSize: "200% 100%" }} />
                              <span className="relative z-10 text-primary-foreground flex items-center justify-center gap-1.5">
                                {submitIncomingRequestsMutation.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "অ্যাডমিনে পাঠান"}
                              </span>
                            </motion.button>
                            <button onClick={() => { setShowRequestSubmitPassword(false); setRequestSubmitPassword(""); setSubmitterPaymentNumber(""); }}
                              className="px-4 py-3 rounded-xl border border-border text-muted-foreground hover:bg-secondary transition-colors font-bold text-sm">বাতিল</button>
                          </div>
                        </div>
                      ) : (
                        <motion.button whileTap={{ scale: 0.92 }} onClick={() => {
                          if (!canSubmitList) {
                            toast({ title: `সর্বনিম্ন ${minRequestTarget} টি রিকুয়েস্ট দরকার`, variant: "destructive" });
                            return;
                          }
                          setShowRequestSubmitPassword(true);
                        }} className={`w-full relative py-3.5 rounded-2xl font-black overflow-hidden ${!canSubmitList ? "opacity-50" : ""}`}>
                          <motion.div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--purple))] via-[hsl(var(--pink))] to-[hsl(var(--purple))]"
                            animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} style={{ backgroundSize: "200% 100%" }} />
                          <span className="relative z-10 text-primary-foreground flex items-center justify-center gap-2">
                            📋 সম্পূর্ণ লিস্ট সাবমিট {minRequestTarget > 0 ? `(${incomingRequests.length}/${minRequestTarget})` : ""}
                          </span>
                        </motion.button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ========== SETTINGS PANEL ========== */}
        {activePanel === "settings" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <button onClick={() => setActivePanel("home")} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors">
              ← হোমে ফিরুন
            </button>
            <div className="glass-card rounded-3xl border border-primary/20 overflow-hidden">
              <div className="p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[hsl(var(--amber))]/30 to-[hsl(var(--orange))]/25 flex items-center justify-center border border-[hsl(var(--amber))]/30">
                    <Settings className="w-6 h-6 text-[hsl(var(--amber))]" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black">⚙️ সেটিংস</h2>
                    <p className="text-[10px] text-muted-foreground">অ্যাকাউন্ট ও নিরাপত্তা সেটিংস</p>
                  </div>
                </div>

                {/* Profile link */}
                <button onClick={() => navigate("/profile")} className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border/50 bg-secondary/30 hover:bg-secondary/50 transition-all">
                  <User className="w-5 h-5 text-primary" />
                  <div className="text-left flex-1">
                    <p className="text-sm font-bold">👤 প্রোফাইল দেখুন</p>
                    <p className="text-[10px] text-muted-foreground">নাম, ছবি, কভার ফটো পরিবর্তন</p>
                  </div>
                </button>

                {/* Request password */}
                {(user as any).request_password ? (
                  <div className="flex items-center gap-3 p-4 rounded-2xl border border-[hsl(var(--purple))]/20 bg-[hsl(var(--purple))]/5">
                    <Lock className="w-5 h-5 text-[hsl(var(--purple))]" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-[hsl(var(--purple))]">🔐 রিকুয়েস্ট পাসওয়ার্ড</p>
                      <p className="text-[10px] text-muted-foreground">পাসওয়ার্ড সেট করা আছে — পরিবর্তন করতে অ্যাডমিনের সাহায্য নিন</p>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowRequestPasswordSetup(true)} className="w-full flex items-center gap-3 p-4 rounded-2xl border border-[hsl(var(--purple))]/20 bg-[hsl(var(--purple))]/5 hover:bg-[hsl(var(--purple))]/10 transition-all">
                    <KeyRound className="w-5 h-5 text-[hsl(var(--purple))]" />
                    <div className="text-left flex-1">
                      <p className="text-sm font-bold text-[hsl(var(--purple))]">🔐 রিকুয়েস্ট পাসওয়ার্ড সেটআপ</p>
                      <p className="text-[10px] text-muted-foreground">রিকুয়েস্ট পাঠাতে পাসওয়ার্ড দরকার</p>
                    </div>
                  </button>
                )}

                {/* Terms */}
                <button onClick={() => setShowTermsModal(true)} className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border/50 bg-secondary/30 hover:bg-secondary/50 transition-all">
                  <FileText className="w-5 h-5 text-[hsl(var(--amber))]" />
                  <div className="text-left flex-1">
                    <p className="text-sm font-bold">📋 শর্তাবলী</p>
                    <p className="text-[10px] text-muted-foreground">অ্যাপের নিয়ম-কানুন দেখুন</p>
                  </div>
                </button>

                {/* Install */}
                {!window.matchMedia("(display-mode: standalone)").matches && (
                  <button onClick={() => navigate("/install")} className="w-full flex items-center gap-3 p-4 rounded-2xl border border-[hsl(var(--emerald))]/20 bg-[hsl(var(--emerald))]/5 hover:bg-[hsl(var(--emerald))]/10 transition-all">
                    <Download className="w-5 h-5 text-[hsl(var(--emerald))]" />
                    <div className="text-left flex-1">
                      <p className="text-sm font-bold text-[hsl(var(--emerald))]">📲 অ্যাপ ইনস্টল করুন</p>
                      <p className="text-[10px] text-muted-foreground">হোম স্ক্রিনে অ্যাপ যোগ করুন</p>
                    </div>
                  </button>
                )}

                {/* Logout */}
                <button onClick={handleLogout} className="w-full flex items-center gap-3 p-4 rounded-2xl border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 transition-all">
                  <LogOut className="w-5 h-5 text-destructive" />
                  <div className="text-left flex-1">
                    <p className="text-sm font-bold text-destructive">🚪 লগআউট</p>
                    <p className="text-[10px] text-muted-foreground">অ্যাকাউন্ট থেকে বের হন</p>
                  </div>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
