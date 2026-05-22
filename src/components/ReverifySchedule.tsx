import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ShieldCheck, Unlock, X, Wallet as WalletIcon } from "lucide-react";
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

export function ReverifySchedule() {
  const { user } = useAuth();
  const [zoomPhoto, setZoomPhoto] = useState<{ url: string; wallet: string } | null>(null);
  const [showAll, setShowAll] = useState(false);

  const { data: queue = [] } = useQuery<QueueItem[]>({
    queryKey: ["reverify-schedule", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reverify_queue")
        .select("id,status,created_at,wallet_address,face_photo_url")
        .eq("assigned_user_id", user!.id)
        .eq("status", "pending");
      if (error) throw error;
      return (data || []) as QueueItem[];
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

  const rows = useMemo(() => {
    return queue
      .map((q) => ({ ...q, ready: true, progress: 100 }))
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
  }, [queue]);

  const readyCount = rows.filter((r) => r.ready).length;
  const growingCount = 0;

  if (rows.length === 0) return null;

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
                    <span className="text-[10px] font-black text-[hsl(var(--emerald))] flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> READY
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-1.5 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                    <motion.div
                      initial={false}
                      animate={{ width: `${r.progress}%` }}
                      transition={{ duration: 0.5 }}
                      className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--emerald))] to-[hsl(var(--cyan))]"
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[9px] text-muted-foreground">
                      🎉 এখনই Re-verify করুন
                    </span>
                    <span className="text-[9px] font-bold text-[hsl(var(--emerald))]">
                      +৳{rewardRate}
                    </span>
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
            💡 এই Account গুলোর জন্য GoodDollar Re-verify চাইছে। ছবি দেখে চিনে নিন — Re-verify এর সময় ওই face স্ক্যান করতে হবে।
          </p>
        </div>
      </motion.div>

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