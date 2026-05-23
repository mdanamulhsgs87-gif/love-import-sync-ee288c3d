import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ShieldCheck, Unlock, X, Wallet as WalletIcon, Hourglass } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getPublicSettings } from "@/lib/api";

type QueueItem = {
  id: string;
  status: string;
  created_at: string;
  wallet_address: string;
  face_photo_url: string | null;
};

type BindingItem = {
  id: string;
  created_at: string;
  wallet_address: string;
  face_photo_url: string | null;
};

const WAIT_MS = 4 * 24 * 60 * 60 * 1000; // 4 days

export function ReverifySchedule() {
  const { user } = useAuth();
  const [zoomPhoto, setZoomPhoto] = useState<{ url: string; wallet: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: queue = [] } = useQuery<QueueItem[]>({
    queryKey: ["reverify-schedule", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reverify_queue")
        .select("id,status,created_at,wallet_address,face_photo_url")
        .eq("assigned_user_id", user!.id);
      if (error) throw error;
      return ((data || []) as QueueItem[]).filter((q) => q.status === "pending" || q.status === "completed");
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  const { data: bindings = [] } = useQuery<BindingItem[]>({
    queryKey: ["my-bindings-schedule", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("face_wallet_bindings")
        .select("id,created_at,wallet_address,face_photo_url")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data || []) as BindingItem[];
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  const { data: settings } = useQuery({
    queryKey: ["public-settings-schedule"],
    queryFn: getPublicSettings,
    staleTime: 60000,
  });
  const rewardRate = settings?.rewardRate || 40;

  // Bindings not yet (or no-longer) in the queue → "waiting" with 4-day countdown
  const queueWallets = useMemo(
    () => new Set(queue.map((q) => q.wallet_address.toLowerCase())),
    [queue]
  );
  const waitingRows = useMemo(() => {
    return bindings
      .filter((b) => !queueWallets.has(b.wallet_address.toLowerCase()))
      .map((b) => {
        const elapsed = Math.max(0, now - new Date(b.created_at).getTime());
        const remaining = Math.max(0, WAIT_MS - elapsed);
        const progress = Math.min(100, Math.round((elapsed / WAIT_MS) * 100));
        return {
          id: `wait-${b.id}`,
          status: "waiting" as const,
          created_at: b.created_at,
          wallet_address: b.wallet_address,
          face_photo_url: b.face_photo_url,
          ready: false,
          progress,
          remaining,
        };
      });
  }, [bindings, queueWallets, now]);

  const pendingQueue = useMemo(() => queue.filter((q) => q.status === "pending"), [queue]);

  const rows = useMemo(() => {
    const readyRows = pendingQueue.map((q) => ({
      ...q,
      ready: true as const,
      progress: 100,
      remaining: 0,
    }));
    // Only READY items appear in the schedule list now.
    // Waiting (1st verify pending) items are rendered in a separate card above.
    return readyRows.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [pendingQueue]);

  const sortedWaitingRows = useMemo(
    () => [...waitingRows].sort((a, b) => a.remaining - b.remaining),
    [waitingRows]
  );
  const [showAllWaiting, setShowAllWaiting] = useState(false);

  const readyCount = rows.filter((r) => r.ready).length;
  const growingCount = waitingRows.length;

  if (rows.length === 0 && waitingRows.length === 0) return null;

  const formatRemainingParts = (ms: number) => {
    if (ms <= 0) return { d: 1, h: 0, m:  0, s: 0, done: true };
    const totalSec = Math.floor(ms / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return { d, h, m, s, done: false };
  };

  const scrollToReverify = () => {
    const el = document.getElementById("reverify-start-btn") || document.getElementById("reverify-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("animate-pulse");
      setTimeout(() => el.classList.remove("animate-pulse"), 2000);
    }
  };

  return (
    <>
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         1st Verify Pending — BIG BEAUTIFUL countdown cards
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {sortedWaitingRows.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl border-2 border-[hsl(var(--amber))]/60 mb-3 shadow-xl shadow-[hsl(var(--amber))]/15"
        >
          <motion.div
            className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--amber))]/20 via-[hsl(var(--orange))]/15 to-[hsl(var(--rose))]/15"
            animate={{ opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 4, repeat: Infinity }}
          />
          <div className="relative z-10 p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ rotate: [0, 20, -20, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[hsl(var(--amber))] to-[hsl(var(--orange))] flex items-center justify-center shadow-lg shadow-[hsl(var(--amber))]/40"
              >
                <Hourglass className="w-6 h-6 text-primary-foreground" />
              </motion.div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-black text-[hsl(var(--amber))] flex items-center gap-2">
                  ১ম ভেরিফাই Pending
                  <span className="text-xs px-2.5 py-1 rounded-full bg-[hsl(var(--amber))] text-primary-foreground font-black shadow-md">
                    {sortedWaitingRows.length}
                  </span>
                </h2>
                <p className="text-xs text-muted-foreground font-medium">
                  ৪ দিন পর Re-verify করলে প্রতিটিতে +৳{rewardRate} যোগ হবে
                </p>
              </div>
            </div>

            {/* Wallet Cards */}
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1 -mr-1">
              {(showAllWaiting ? sortedWaitingRows : sortedWaitingRows.slice(1)).map(
                (r, idx) => {
                  const time = formatRemainingParts(r.remaining);
                  return (
                    <motion.div
                      key={r.id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="rounded-3xl border-2 border-[hsl(var(--amber))]/40 bg-gradient-to-br from-[hsl(var(--amber))]/8 to-[hsl(var(--orange))]/5 p-4 space-y-3"
                    >
                      {/* Top row: photo + wallet + status */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() =>
                            r.face_photo_url &&
                            setZoomPhoto({ url: r.face_photo_url, wallet: r.wallet_address })
                          }
                          className="relative shrink-0"
                        >
                          {r.face_photo_url ? (
                            <img
                              src={r.face_photo_url}
                              alt="Bound face"
                              className="w-14 h-14 rounded-2xl object-cover border-2 border-[hsl(var(--amber))]/70 shadow-md"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center border-2 border-[hsl(var(--amber))]/40">
                              <WalletIcon className="w-6 h-6 text-muted-foreground" />
                            </div>
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-mono font-bold text-foreground truncate block">
                            {r.wallet_address.slice(0, 6)}…{r.wallet_address.slice(-4)}
                          </span>
                          <span className="inline-flex items-center gap-1.5 mt-1 text-xs font-black text-[hsl(var(--amber))] bg-[hsl(var(--amber))]/15 px-2.5 py-1 rounded-full">
                            <Hourglass className="w-3.5 h-3.5" /> অপেক্ষায়
                          </span>
                        </div>
                      </div>

                      {/* BIG Countdown Blocks */}
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { val: time.d, label: "দিন", color: "from-[hsl(var(--amber))] to-[hsl(var(--orange))]" },
                          { val: time.h, label: "ঘন্টা", color: "from-[hsl(var(--cyan))] to-[hsl(var(--blue))]" },
                          { val: time.m, label: "মিনিট", color: "from-[hsl(var(--emerald))] to-[hsl(var(--cyan))]" },
                          { val: time.s, label: "সেকেন্ড", color: "from-[hsl(var(--purple))] to-[hsl(var(--pink))]" },
                        ].map((block, bIdx) => (
                          <motion.div
                            key={bIdx}
                            className="rounded-2xl bg-card/80 border border-[hsl(var(--amber))]/30 p-2 text-center shadow-sm"
                          >
                            <div className={`text-xl font-black bg-gradient-to-br ${block.color} bg-clip-text text-transparent tabular-nums`}>
                              {String(block.val).padStart(2, "0")}
                            </div>
                            <div className="text-[10px] font-bold text-muted-foreground mt-0.5">
                              {block.label}
                            </div>
                          </motion.div>
                        ))}
                      </div>

                      {/* Progress bar - thick with percentage */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-muted-foreground">
                            Ready হওয়ার অগ্রগতি
                          </span>
                          <span className="text-sm font-black text-[hsl(var(--amber))]">
                            {r.progress}%
                          </span>
                        </div>
                        <div className="h-3 rounded-full bg-muted/60 overflow-hidden border border-[hsl(var(--amber))]/20">
                          <motion.div
                            initial={false}
                            animate={{ width: `${r.progress}%` }}
                            transition={{ duration: 0.5 }}
                            className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--amber))] to-[hsl(var(--orange))] shadow-[0_0_12px_hsl(var(--amber)/0.5)]"
                          />
                        </div>
                      </div>
                    </motion.div>
                  );
                }
              )}
            </div>

            {sortedWaitingRows.length > 1 && (
              <button
                onClick={() => setShowAllWaiting((v) => !v)}
                className="w-full py-3 rounded-2xl border-2 border-[hsl(var(--amber))]/50 bg-[hsl(var(--amber))]/12 text-[hsl(var(--amber))] text-sm font-black hover:bg-[hsl(var(--amber))]/20 transition-colors shadow-md"
              >
                {showAllWaiting
                  ? "🔼 সংক্ষেপে দেখুন"
                  : `🔽 সবগুলো দেখুন (${sortedWaitingRows.length}টি)`}
              </button>
            )}
          </div>
        </motion.div>
      )}

      {rows.length > 0 && (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border-2 border-[hsl(var(--cyan))]/40"
      >
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--cyan))]/12 via-[hsl(var(--blue))]/8 to-[hsl(var(--emerald))]/12"
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 5, repeat: Infinity }}
        />

        <div className="relative z-10 p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[hsl(var(--cyan))] to-[hsl(var(--emerald))] flex items-center justify-center shadow-lg shadow-[hsl(var(--cyan))]/30"
            >
              <Unlock className="w-5 h-5 text-primary-foreground" />
            </motion.div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-black text-[hsl(var(--cyan))] flex items-center gap-1.5">
                ⏳ Re-verify সময়সূচি
                {readyCount > 0 && (
                  <motion.span
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-[hsl(var(--emerald))] text-primary-foreground font-black"
                  >
                    {readyCount} READY
                  </motion.span>
                )}
              </h2>
              <p className="text-[10px] text-muted-foreground">
                Good-App Re-verify চাইছে — এখনই Re-verify করুন · ৳{rewardRate}/Account
              </p>
            </div>
          </div>

          {/* Summary chips */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-secondary/60 border border-border/50 p-2 text-center">
              <div className="text-[9px] text-muted-foreground font-bold">⏳ অপেক্ষায়</div>
              <div className="text-base font-black text-[hsl(var(--amber))]">{growingCount}</div>
            </div>
            <div className="rounded-xl bg-[hsl(var(--emerald))]/15 border border-[hsl(var(--emerald))]/40 p-2 text-center">
              <div className="text-[9px] text-[hsl(var(--emerald))] font-bold">🔓 Ready</div>
              <motion.div
                animate={readyCount > 0 ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="text-base font-black text-[hsl(var(--emerald))]"
              >
                {readyCount}
              </motion.div>
            </div>
            <div className="rounded-xl bg-secondary/60 border border-border/50 p-2 text-center">
              <div className="text-[9px] text-muted-foreground font-bold">মোট</div>
              <div className="text-base font-black">{rows.length}</div>
            </div>
          </div>

          {/* Ready CTA */}
          <AnimatePresence>
            {readyCount > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                whileTap={{ scale: 0.98 }}
                onClick={scrollToReverify}
                className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-[hsl(var(--emerald))] to-[hsl(var(--cyan))] text-primary-foreground text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-[hsl(var(--emerald))]/40"
              >
                <Sparkles className="w-4 h-4" />
                {readyCount}টি Account এখন Re-verify করুন · ৳{readyCount * rewardRate}
              </motion.button>
            )}
          </AnimatePresence>

          {/* List — sorted by least time remaining first */}
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 -mr-1">
            {(showAll ? rows : rows.slice(0, 3)).map((r, idx) => (
              <motion.div
                key={r.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
                className={`flex items-center gap-3 rounded-2xl border p-2.5 ${
                  r.ready
                    ? "bg-[hsl(var(--emerald))]/10 border-[hsl(var(--emerald))]/40"
                    : "bg-secondary/40 border-border/50"
                }`}
              >
                {/* Face photo — click to zoom */}
                <button
                  onClick={() =>
                    r.face_photo_url &&
                    setZoomPhoto({ url: r.face_photo_url, wallet: r.wallet_address })
                  }
                  className="relative shrink-0"
                >
                  {r.face_photo_url ? (
                    <img
                      src={r.face_photo_url}
                      alt="Bound face"
                      className={`w-12 h-12 rounded-xl object-cover border-2 ${
                        r.ready ? "border-[hsl(var(--emerald))]" : "border-border"
                      }`}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                      <WalletIcon className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  {r.ready && (
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[hsl(var(--emerald))] flex items-center justify-center shadow-md"
                    >
                      <Unlock className="w-3 h-3 text-primary-foreground" />
                    </motion.div>
                  )}
                </button>

                {/* Wallet + progress */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono font-bold text-foreground/80 truncate">
                      {r.wallet_address.slice(0, 6)}…{r.wallet_address.slice(-4)}
                    </span>
                    {r.ready ? (
                      <span className="text-[10px] font-black text-[hsl(var(--emerald))] flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> READY
                      </span>
                    ) : (
                      <span className="text-[10px] font-black text-[hsl(var(--amber))] flex items-center gap-1">
                        <Hourglass className="w-3 h-3" /> অপেক্ষায়
                      </span>
                    )}
                  </div>
                  {/* Progress bar */}
                  <div className="mt-1.5 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                    <motion.div
                      initial={false}
                      animate={{ width: `${r.progress}%` }}
                      transition={{ duration: 0.5 }}
                      className={`h-full rounded-full bg-gradient-to-r ${
                        r.ready
                          ? "from-[hsl(var(--emerald))] to-[hsl(var(--cyan))]"
                          : "from-[hsl(var(--amber))] to-[hsl(var(--orange))]"
                      }`}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    {r.ready ? (
                      <>
                        <span className="text-[9px] text-muted-foreground">
                          🎉 এখনই Re-verify করুন
                        </span>
                        <span className="text-[9px] font-bold text-[hsl(var(--emerald))]">
                          +৳{rewardRate}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-[9px] text-muted-foreground">
                          ⏳ Ready হতে বাকি
                        </span>
                        <span className="text-[9px] font-bold text-[hsl(var(--amber))] font-mono">
                          {formatRemaining((r as any).remaining)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {rows.length > 3 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="w-full py-2 rounded-2xl border border-[hsl(var(--emerald))]/40 bg-[hsl(var(--emerald))]/8 text-[hsl(var(--emerald))] text-xs font-black hover:bg-[hsl(var(--emerald))]/15 transition-colors"
            >
              {showAll
                ? "🔼 সংক্ষেপে দেখুন"
                : `🔽 সবগুলো দেখুন (${rows.length}টি)`}
            </button>
          )}

          <p className="text-[10px] text-center text-muted-foreground leading-relaxed">
            💡 এই Account গুলোর জন্য Good-App Re-verify চাইছে। ছবি দেখে চিনে নিন — Re-verify এর সময় ওই face স্ক্যান করতে হবে।
          </p>

          {/* How the system works — helps users understand timing */}
          <div className="rounded-3xl border-2 border-[hsl(var(--amber))]/50 bg-gradient-to-br from-[hsl(var(--amber))]/15 via-[hsl(var(--orange))]/8 to-[hsl(var(--rose))]/10 p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[hsl(var(--amber))] to-[hsl(var(--orange))] flex items-center justify-center shadow-lg shadow-[hsl(var(--amber))]/30">
                <svg className="w-5 h-5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 1 1 1-18 0 9 9 0 1 1 18 0Z" />
                </svg>
              </div>
              <h3 className="text-base font-black text-[hsl(var(--amber))]">
                Re-verify কীভাবে কাজ করে?
              </h3>
            </div>

            <div className="space-y-3.5">
              <div className="flex gap-3 items-start">
                <div className="w-7 h-7 rounded-lg bg-[hsl(var(--blue))]/20 flex items-center justify-center shrink-1">
                  <span className="text-sm font-black text-[hsl(var(--blue))]">১</span>
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed pt-0.5">
                  <b className="text-foreground">প্রথম Verify</b> করলেই আপনার <b className="text-[hsl(var(--emerald))]">৳{rewardRate}</b> টাকা <b className="text-[hsl(var(--amber))]">Locked Vault</b> এ সুরক্ষিত হয়ে যাবে 🔒 — টাকা আপনারই, শুধু Re-verify এর অপেক্ষায় 💎
                </p>
              </div>

              <div className="flex gap-3 items-start">
                <div className="w-7 h-7 rounded-lg bg-[hsl(var(--cyan))]/20 flex items-center justify-center shrink-0">
                  <span className="text-sm font-black text-[hsl(var(--cyan))]">২</span>
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed pt-1">
                  <b className="text-foreground">৩-৪ দিন পর</b> Good-App আবার Re-verify চাইবে।
                </p>
              </div>

              <div className="flex gap-3 items-start">
                <div className="w-7 h-7 rounded-lg bg-[hsl(var(--emerald))]/20 flex items-center justify-center shrink-0">
                  <span className="text-sm font-black text-[hsl(var(--emerald))]">৩</span>
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed pt-1">
                  Re-verify চাইলে Account এ <b className="text-[hsl(var(--emerald))]">READY</b> লেখা দেখাবে — তখনই করতে পারবেন।
                </p>
              </div>

              <div className="flex gap-3 items-start">
                <div className="w-7 h-7 rounded-lg bg-[hsl(var(--rose))]/25 flex items-center justify-center shrink-0 border border-[hsl(var(--rose))]/40">
                  <span className="text-sm font-black text-[hsl(var(--emerald))]">৪</span>
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed pt-1">
                  Re-verify <b className="text-[hsl(var(--emerald))]">Success</b> হলেই Pending থেকে <b className="text-[hsl(var(--emerald))]">৳{rewardRate}</b> বা USDT সরাসরি আপনার Main Balance এ যোগ হয়ে যাবে 🎉
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
      )}

      {/* Photo zoom modal */}
      <AnimatePresence>
        {zoomPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setZoomPhoto(null)}
            className="fixed inset-0 z-[200] bg-background/90 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-sm w-full"
            >
              <button
                onClick={() => setZoomPhoto(null)}
                className="absolute -top-3 -right-3 z-10 w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center shadow-lg"
              >
                <X className="w-4 h-4" />
              </button>
              <img
                src={zoomPhoto.url}
                alt="Bound face"
                className="w-full rounded-3xl border-2 border-[hsl(var(--cyan))]/40 shadow-2xl"
              />
              <div className="mt-3 text-center">
                <p className="text-[10px] text-muted-foreground">Bound Wallet</p>
                <p className="text-xs font-mono font-bold break-all">{zoomPhoto.wallet}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}