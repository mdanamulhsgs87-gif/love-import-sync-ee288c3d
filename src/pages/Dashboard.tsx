import { useState, useEffect } from "react";
import { copyToClipboard as copyText } from "@/lib/clipboard";
import { useAuth } from "@/hooks/use-auth";
import { KeySubmitter } from "@/components/KeySubmitter";
import { WithdrawForm } from "@/components/WithdrawForm";
import { User, Wallet, Copy, Check, Bell, Send, Loader2, ChevronDown, ChevronRight, MessageCircle, Shield, Lock, Newspaper, Download, Sparkles, X, Play, MoreVertical, Settings, LogOut, Home, CreditCard, Smartphone, Clock, CheckCircle2, ArrowRight, Zap, Crown, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPublicSettings, updateUserPaymentStatus } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { createUserTransferRequest, getIncomingTransferRequests, submitIncomingTransferRequests, cancelIncomingRequest } from "@/lib/user-requests";
import { ReverifySection } from "@/components/ReverifySection";
import { ReverifySchedule } from "@/components/ReverifySchedule";
import { ReferralCard } from "@/components/ReferralCard";
import { hasUserPosted } from "@/lib/feed-api";
import { AnnouncementPopup } from "@/components/AnnouncementPopup";
import { formatCountdown, getRemainingMilliseconds } from "@/lib/countdown";
import { getUnreadCount } from "@/lib/chat-api";
import { calculateSharedBalance } from "@/lib/balance";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
  const [nowMs, setNowMs] = useState(Date.now());
  const [prevKeyCount, setPrevKeyCount] = useState<number | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [loadedAppVersion, setLoadedAppVersion] = useState<number | null>(null);

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

  // Real reverify queue for THIS user (drives Pending/Complete counts)
  const { data: myReverifyQueue = [] } = useQuery({
    queryKey: ["my-reverify-queue", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reverify_queue")
        .select("id,status")
        .eq("assigned_user_id", user!.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 15000,
    refetchInterval: 30000,
  });

  // User's transactions — needed so withdrawals subtract from displayed balance
  const { data: userTransactions = [] } = useQuery({
    queryKey: ["user-transactions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("amount,type,status")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const createUserRequestMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("ইউজার পাওয়া যায়নি");
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
      if (!(user as any).locked_target_guest_id) {
        await supabase.from("users").update({ locked_target_guest_id: targetGuestId } as any).eq("id", user.id);
        await refreshUser();
      }
    },
    onSuccess: () => {
      setRequestPaymentNumber("");
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
    const reverifyChannel = supabase
      .channel('dashboard-reverify-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reverify_queue', filter: user ? `assigned_user_id=eq.${user.id}` : undefined }, () => {
        queryClient.invalidateQueries({ queryKey: ["my-reverify-queue", user?.id] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(usersChannel);
      supabase.removeChannel(txChannel);
      supabase.removeChannel(requestsChannel);
      supabase.removeChannel(reverifyChannel);
    };
  }, [user?.id, queryClient, refreshUser]);

  const bonusEnabled = publicSettings?.bonusStatus === "on";
  const targetAmount = publicSettings?.bonusTarget || 10;
  const customNoticeText = publicSettings?.customNotice;
  const minRequestVerified = publicSettings?.minRequestVerified || 10;
  const minRequestTarget = publicSettings?.minRequestTarget || 0;
  const currentRate = publicSettings?.rewardRate || 0;
  const usdtToBdtRate = publicSettings?.usdtToBdtRate || 124;
  const sharedBalance = calculateSharedBalance(user as any, publicSettings, userTransactions as any[]);
  const computedBdtBalance = sharedBalance.availableBdt;
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

          {/* ✨ Premium 3-dot menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="group relative flex h-11 w-11 items-center justify-center rounded-full text-white transition-all duration-300 hover:scale-110 active:scale-95"
                style={{
                  background: "linear-gradient(140deg, hsl(152 60% 35%) 0%, hsl(187 72% 45%) 50%, hsl(217 91% 58%) 100%)",
                  boxShadow: "0 8px 24px -6px hsl(187 72% 45% / 0.5), inset 0 1px 0 hsl(0 0% 100% / 0.25)",
                }}
              >
                <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: "linear-gradient(140deg, hsl(217 91% 58%), hsl(270 70% 60%))" }} />
                <span className="absolute inset-[2px] rounded-full ring-1 ring-white/20" />
                <MoreVertical className="h-5 w-5 relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-gradient-to-br from-rose-500 to-red-600 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 ring-2 ring-background shadow-lg shadow-red-500/40 z-20">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={12}
              className="w-[300px] rounded-3xl border border-white/10 p-2.5 shadow-2xl shadow-black/60 overflow-hidden relative"
              style={{
                background: "linear-gradient(165deg, hsl(222 35% 12%) 0%, hsl(228 40% 9%) 100%)",
                backdropFilter: "blur(24px)",
              }}
            >
              {/* Header gradient strip */}
              <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: "linear-gradient(90deg, hsl(152 56% 45%), hsl(187 72% 55%), hsl(217 91% 60%), hsl(270 70% 60%))" }} />

              {/* User mini profile */}
              <div className="flex items-center gap-3 px-2 pt-4 pb-3 mb-1">
                <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg" style={{ background: "linear-gradient(135deg, hsl(152 56% 38%), hsl(217 91% 55%))" }}>
                  {(user.display_name || "?").charAt(3).toUpperCase()}
                </div>
                <div className="flex-1 min-w-1">
                  <p className="font-bold text-sm text-white truncate">{user.display_name || "Unknown"}</p>
                  <p className="text-[11px] text-white/50">মেনু</p>
                </div>
              </div>

              <DropdownMenuSeparator className="bg-white/10 my-2" />

              {/* Section: Navigation */}
              <div className="px-2 mb-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-white/40 ml-1">🧭 নেভিগেশন</p>
              </div>
              <DropdownMenuItem className={`group rounded-2xl px-3 py-3 cursor-pointer transition-all duration-200 hover:bg-white/10 focus:bg-white/10 border-l-[3px] border-transparent hover:border-primary ${activePanel === "home" ? "bg-white/10 border-primary" : ""}`} onClick={() => setActivePanel("home")}>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary mr-3 group-hover:scale-110 transition-transform">
                  <Home className="h-[18px] w-[18px]" />
                </span>
                <span className="flex-1 text-[14px] font-bold text-white/90">হোম (ফেস ভেরিফাই)</span>
                {activePanel === "home" && <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />}
                <ChevronRight className="h-4 w-4 text-white/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all" />
              </DropdownMenuItem>
              <DropdownMenuItem className="group rounded-2xl px-3 py-3 cursor-pointer transition-all duration-200 hover:bg-white/10 focus:bg-white/10 border-l-[3px] border-transparent hover:border-[hsl(var(--amber))]" onClick={() => navigate("/feed")}>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--amber))]/20 text-[hsl(var(--amber))] mr-3 group-hover:scale-110 transition-transform">
                  <Newspaper className="h-[18px] w-[18px]" />
                </span>
                <span className="flex-1 text-[14px] font-bold text-white/90">নিউজ ফিড</span>
                <ChevronRight className="h-4 w-4 text-white/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all" />
              </DropdownMenuItem>
              <DropdownMenuItem className="group rounded-2xl px-3 py-3 cursor-pointer transition-all duration-200 hover:bg-white/10 focus:bg-white/10 border-l-[3px] border-transparent hover:border-[hsl(var(--cyan))]" onClick={() => navigate("/chat")}>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--cyan))]/20 text-[hsl(var(--cyan))] mr-3 group-hover:scale-110 transition-transform">
                  <MessageCircle className="h-[18px] w-[18px]" />
                </span>
                <span className="flex-1 text-[14px] font-bold text-white/90">মেসেজ</span>
                {unreadCount > 0 && (
                  <span className="mr-2 min-w-[22px] h-[22px] bg-gradient-to-br from-red-500 to-rose-600 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1.5 shadow-lg shadow-red-500/30">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 text-white/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all" />
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-white/10 my-2" />

              {/* Section: Earnings */}
              <div className="px-2 mb-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-white/40 ml-1">💼 আয় ও সুবিধা</p>
              </div>
              <DropdownMenuItem className={`group rounded-2xl px-3 py-3 cursor-pointer transition-all duration-200 hover:bg-white/10 focus:bg-white/10 border-l-[3px] border-transparent hover:border-[hsl(var(--cyan))] ${activePanel === "wallet" ? "bg-white/10 border-[hsl(var(--cyan))]" : ""}`} onClick={() => setActivePanel("wallet")}>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--cyan))]/20 text-[hsl(var(--cyan))] mr-3 group-hover:scale-110 transition-transform">
                  <Wallet className="h-[18px] w-[18px]" />
                </span>
                <span className="flex-1 text-[14px] font-bold text-white/90">ওয়ালেট ও উইথড্র</span>
                {activePanel === "wallet" && <span className="h-2 w-2 rounded-full bg-[hsl(var(--cyan))] shadow-[0_0_8px_hsl(var(--cyan))]" />}
                <ChevronRight className="h-4 w-4 text-white/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all" />
              </DropdownMenuItem>
              <DropdownMenuItem className="group rounded-2xl px-3 py-3 cursor-pointer transition-all duration-200 hover:bg-white/10 focus:bg-white/10 border-l-[3px] border-transparent hover:border-[hsl(var(--emerald))]" onClick={() => navigate("/mobile-recharge")}>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--emerald))]/20 text-[hsl(var(--emerald))] mr-3 group-hover:scale-110 transition-transform">
                  <Smartphone className="h-[18px] w-[18px]" />
                </span>
                <span className="flex-1 text-[14px] font-bold text-white/90">মোবাইল রিচার্জ</span>
                <ChevronRight className="h-4 w-4 text-white/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all" />
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-white/10 my-2" />

              {/* Section: Settings */}
              <div className="px-2 mb-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-white/40 ml-1">⚙️ সেটিংস ও অন্যান্য</p>
              </div>
              <DropdownMenuItem className={`group rounded-2xl px-3 py-3 cursor-pointer transition-all duration-200 hover:bg-white/10 focus:bg-white/10 border-l-[3px] border-transparent hover:border-[hsl(var(--amber))] ${activePanel === "settings" ? "bg-white/10 border-[hsl(var(--amber))]" : ""}`} onClick={() => setActivePanel("settings")}>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--amber))]/20 text-[hsl(var(--amber))] mr-3 group-hover:scale-110 transition-transform">
                  <Settings className="h-[18px] w-[18px]" />
                </span>
                <span className="flex-1 text-[14px] font-bold text-white/90">সেটিংস</span>
                {activePanel === "settings" && <span className="h-2 w-2 rounded-full bg-[hsl(var(--amber))] shadow-[0_0_8px_hsl(var(--amber))]" />}
                <ChevronRight className="h-4 w-4 text-white/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all" />
              </DropdownMenuItem>
              {!window.matchMedia("(display-mode: standalone)").matches && (
                <DropdownMenuItem className="group rounded-2xl px-3 py-3 cursor-pointer transition-all duration-200 hover:bg-white/10 focus:bg-white/10 border-l-[3px] border-transparent hover:border-[hsl(var(--emerald))]" onClick={() => navigate("/install")}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--emerald))]/20 text-[hsl(var(--emerald))] mr-3 group-hover:scale-110 transition-transform">
                    <Download className="h-[18px] w-[18px]" />
                  </span>
                  <span className="flex-1 text-[14px] font-bold text-white/90">অ্যাপ ইনস্টল</span>
                  <ChevronRight className="h-4 w-4 text-white/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all" />
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator className="bg-white/10 my-2" />

              {/* Logout */}
              <DropdownMenuItem className="group rounded-2xl px-3 py-3 cursor-pointer transition-all duration-200 hover:bg-red-500/10 focus:bg-red-500/10 border-l-[3px] border-transparent hover:border-red-500 text-white focus:text-white" onClick={handleLogout}>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/20 text-red-400 mr-3 group-hover:scale-110 transition-transform">
                  <LogOut className="h-[18px] w-[18px]" />
                </span>
                <span className="flex-1 text-[14px] font-bold text-red-400 group-hover:text-red-300">লগআউট</span>
                <ChevronRight className="h-4 w-4 text-red-400/40 group-hover:text-red-400/70 group-hover:translate-x-0.5 transition-all" />
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
              const pendingCount = myReverifyQueue.filter((r: any) => r.status === "pending").length;
              const completeCount = myReverifyQueue.filter((r: any) => r.status === "completed").length;
              const totalCount = pendingCount + completeCount;
              const progressPct = totalCount > 0 ? Math.round((completeCount / totalCount) * 100) : 0;
              return (
            <motion.div custom={-0.5} variants={cardVariants} initial="hidden" animate="visible"
              className="relative rounded-[28px] p-[1.5px] overflow-hidden shadow-[0_20px_60px_-15px_hsl(var(--purple)/0.5)]">
              {/* Static gradient border (perf) */}
              <div
                className="absolute inset-0 rounded-[28px]"
                style={{ background: "linear-gradient(135deg, hsl(var(--purple)), hsl(var(--cyan)), hsl(var(--emerald)), hsl(var(--amber)))" }}
              />
              <div className="relative rounded-[27px] glass-card overflow-hidden">
                {/* Static aurora background (perf) */}
                <div className="pointer-events-none absolute -inset-1 opacity-70"
                  style={{ background: "radial-gradient(60% 60% at 20% 0%, hsl(var(--purple)/0.25), transparent 60%), radial-gradient(60% 60% at 100% 100%, hsl(var(--cyan)/0.20), transparent 60%)" }} />
                <div className="relative z-10 p-5">
                {/* Header — Premium Crown */}
                <div className="w-full flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {/* Ultra-premium 3D crown badge */}
                    <div className="relative w-14 h-14 shrink-0">
                      {/* Static ring (perf) */}
                      <div
                        className="absolute inset-0 rounded-[18px] p-[2px]"
                        style={{ background: "linear-gradient(135deg, hsl(var(--amber)), hsl(var(--orange)), hsl(var(--pink)), hsl(var(--purple)))" }}
                      >
                        <div className="w-full h-full rounded-[16px] bg-background" />
                      </div>
                      {/* Inner gold gradient */}
                      <div className="absolute inset-[3px] rounded-[15px] bg-gradient-to-br from-[hsl(45,95%,55%)] via-[hsl(35,90%,50%)] to-[hsl(25,85%,40%)] flex items-center justify-center overflow-hidden shadow-[inset_0_2px_8px_rgba(255,255,255,0.4),inset_0_-2px_8px_rgba(0,0,0,0.3)]">
                        <div className="relative z-10">
                          <Crown
                            className="w-7 h-7 text-white"
                            fill="white"
                            strokeWidth={2.2}
                            style={{ filter: "drop-shadow(0 0 6px rgba(255,255,255,0.9)) drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}
                          />
                        </div>
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
            {(() => {
              const pCount = myReverifyQueue.filter((r: any) => r.status === "pending").length;
              const pendingBdt = pCount * (currentRate || 0);
              return (
                <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible"
                  className="rounded-3xl border-2 border-slate-200 bg-white shadow-xl shadow-slate-200/60 overflow-hidden">
                  {/* TOP: Pending (faded, locked) */}
                  <div className="relative px-5 pt-5 pb-5 border-b border-dashed border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50">
                    <div className={`flex items-center justify-between gap-3 ${pCount === 0 ? "opacity-50 grayscale" : ""}`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-amber-100 border-2 border-amber-400 flex items-center justify-center shrink-0 shadow-md shadow-amber-300/40">
                          <Lock className="w-5 h-5 text-amber-700" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-amber-800 flex items-center gap-1.5">
                            ⏳ Pending Balance
                            {pCount > 0 && (
                              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-500 text-white">
                                {pCount} Account
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] font-bold text-amber-700/80 mt-0.5">
                            Re-verify দিলেই নিচে যোগ হবে 👇
                          </p>
                        </div>
                      </div>
                      <motion.p
                        key={`pb-${pendingBdt}`}
                        initial={{ scale: 0.85, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="text-3xl font-black text-amber-600 tabular-nums shrink-0 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]"
                      >
                        {pendingBdt}
                        <span className="text-base ml-0.5 text-orange-500">৳</span>
                      </motion.p>
                    </div>

                    {/* Animated arrow flowing down */}
                    {pCount > 0 && (
                      <motion.div
                        animate={{ y: [0, 6, 0], opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 1.6, repeat: Infinity }}
                        className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-white border-2 border-emerald-400 flex items-center justify-center shadow-md z-10"
                      >
                        <ChevronDown className="w-4 h-4 text-emerald-600" />
                      </motion.div>
                    )}
                  </div>

                  {/* BOTTOM: Main / Re-verify balance (bright, ready) */}
                  <div className="relative px-5 pt-5 pb-5 bg-white">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <motion.div
                          animate={{ scale: [1, 1.08, 1] }}
                          transition={{ duration: 2.2, repeat: Infinity }}
                          className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-300/50 shrink-0"
                        >
                          <Wallet className="w-6 h-6 text-white" />
                        </motion.div>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                            ✅ Main Balance
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                              Ready
                            </span>
                          </p>
                        </div>
                      </div>
                      <motion.p
                        key={`mb-${computedBdtBalance}`}
                        initial={{ scale: 0.85, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="text-4xl font-black text-emerald-600 tabular-nums shrink-0 drop-shadow-sm"
                      >
                        {computedBdtBalance}
                        <span className="text-lg ml-0.5 text-amber-500">৳</span>
                      </motion.p>
                    </div>

                    <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-center">
                      <p className="text-[11px] font-bold text-slate-600">
                        💸 এই Balance দিয়ে এখনই <span className="text-emerald-600">Withdraw</span> বা <span className="text-cyan-600">Recharge</span> করুন
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })()}

            {/* 🎁 Bonus Banner — Beautiful & Emoji-rich */}
            {(() => {
              const sb = sharedBalance;
              if (!sb.bonusEnabled) return null;
              const percent = sb.bonusPercent;
              const remaining = sb.remainingAccounts;
              const accountsToNext = sb.accountsToNextTier;
              const nextAt = sb.nextTierAt;
              const nextPct = sb.nextTierPercent;
              const isMax = percent >= 20;
              return (
                <motion.div custom={0.3} variants={cardVariants} initial="hidden" animate="visible">
                  <div className="relative overflow-hidden rounded-3xl border-2 border-[hsl(var(--amber))]/40 bg-gradient-to-br from-[hsl(var(--amber))]/15 via-[hsl(var(--orange))]/10 to-[hsl(var(--pink))]/10 shadow-[0_12px_40px_-10px_hsl(var(--amber)/0.4)]">
                    {/* Sparkle particles */}
                    <div className="pointer-events-none absolute inset-1 opacity-40" style={{ background: "radial-gradient(circle at 15% 20%, hsl(var(--amber)/0.35), transparent 40%), radial-gradient(circle at 85% 80%, hsl(var(--pink)/0.25), transparent 40%)" }} />
                    <div className="relative z-10 p-5">
                      {/* Header row */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[hsl(var(--amber))] to-[hsl(var(--orange))] flex items-center justify-center shadow-lg shadow-[hsl(var(--amber))]/40">
                          <span className="text-2xl">🎁</span>
                        </div>
                        <div>
                          <p className="text-sm font-black text-foreground">বোনাস সিস্টেম চালু আছে! 🔥</p>
                          <p className="text-[11px] text-muted-foreground font-bold">রি-ভেরিফাই করতে থাকুন — বোনাস বাড়তে থাকবে</p>
                        </div>
                        <div className="ml-auto">
                          <span className={`text-[11px] font-black px-2.5 py-1 rounded-full ${isMax ? "bg-gradient-to-r from-[hsl(var(--amber))] to-[hsl(var(--orange))] text-white shadow-lg" : "bg-[hsl(var(--emerald))]/20 text-[hsl(var(--emerald))]"}`}>
                            {isMax ? "🏆 MAX" : "⚡ LIVE"}
                          </span>
                        </div>
                      </div>

                      {/* Rules */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className={`rounded-xl p-2.5 border text-center ${remaining >= 10 ? "bg-[hsl(var(--emerald))]/10 border-[hsl(var(--emerald))]/30" : "bg-secondary/40 border-border/50"}`}>
                          <p className="text-lg">🎯</p>
                          <p className="text-[11px] font-black text-foreground">১০ Account = +১০%</p>
                          {remaining >= 10 && <p className="text-[10px] text-[hsl(var(--emerald))] font-bold mt-0.5">✅ Reached!</p>}
                        </div>
                        <div className={`rounded-xl p-2.5 border text-center ${remaining >= 20 ? "bg-[hsl(var(--emerald))]/10 border-[hsl(var(--emerald))]/30" : "bg-secondary/40 border-border/50"}`}>
                          <p className="text-lg">🏆</p>
                          <p className="text-[11px] font-black text-foreground">২০ Account = +২০%</p>
                          {remaining >= 20 && <p className="text-[10px] text-[hsl(var(--emerald))] font-bold mt-0.5">✅ Reached!</p>}
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="rounded-xl bg-secondary/50 border border-border/40 p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-[11px] font-black text-foreground">📊 বোনাস প্রোগ্রেস</p>
                          <p className="text-[11px] font-black text-[hsl(var(--amber))]">
                            {remaining >= 20 ? "+২০% 🏆" : remaining >= 10 ? "+১০% 🎯" : "০% 😴"}
                          </p>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--amber))] to-[hsl(var(--orange))]"
                            initial={{ width: 1 }}
                            animate={{ width: `${Math.min((remaining / 20) * 100, 100)}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <p className="text-[10px] text-muted-foreground font-bold">
                            {remaining >= 20
                              ? "🔥 সর্বোচ্চ বোনাসে পৌঁছেছেন!"
                              : remaining >= 10
                                ? `${accountsToNext} টি আর করলেই +${nextPct}% 🚀`
                                : `${10 - remaining} টি করলেই +১০% শুরু 🌟`}
                          </p>
                          <p className="text-[10px] font-black text-[hsl(var(--amber))]">{remaining} / 20</p>
                        </div>
                      </div>

                      {/* Bonus money preview */}
                      {sb.bonusBdt > 0 && (
                        <div className="mt-3 rounded-xl bg-gradient-to-r from-[hsl(var(--amber))]/20 to-[hsl(var(--orange))]/15 border border-[hsl(var(--amber))]/30 p-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">💰</span>
                            <p className="text-xs font-bold text-foreground">বর্তমান বোনাস</p>
                          </div>
                          <p className="text-lg font-black text-[hsl(var(--amber))]">+{sb.bonusBdt}৳</p>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })()}

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
            <motion.div custom={1.2} variants={cardVariants} initial="hidden" animate="visible">
              <ReverifySchedule />
            </motion.div>

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
                    <p className="text-xs text-foreground/80">🎁 ১০ Account = +১০% · ২০ Account = +২০% Bonus</p>
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
                      disabled={isRequestLocked || createUserRequestMutation.isPending || (!(user as any).locked_target_guest_id && !requestTargetNumber.trim()) || !requestPaymentNumber.trim()}>
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
