import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCcw, ExternalLink, Loader2, CheckCircle, XCircle, Search, Sparkles, Zap, User } from "lucide-react";
import { ethers } from "ethers";
import { getPublicSettings } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { FaceCapture } from "./FaceCapture";
import { speakStep } from "@/lib/voice-guide";
import { Camera, ChevronDown } from "lucide-react";

const GD_IDENTITY_ADDRESS = "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42";
const CELO_RPC = "https://forno.celo.org";
const GD_IDENTITY_ABI = [
  "function isWhitelisted(address account) view returns (bool)",
];

type ReverifyStep =
  | "idle"
  | "search"
  | "loading_url"
  | "generating_url"
  | "verify_link"
  | "checking"
  | "submitting"
  | "done_success"
  | "done_failed"
  | "face_scanning";

type MatchedBinding = {
  id: string;
  wallet_address: string;
  face_photo_url: string;
  user_id: number;
  face_label?: string;
};

type Candidate = {
  id: string;
  wallet_address: string;
  face_photo_url: string;
  face_label: string;
};

export function ReverifySection() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<ReverifyStep>("idle");
  const [matchedBinding, setMatchedBinding] = useState<MatchedBinding | null>(null);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [showFaceScan, setShowFaceScan] = useState(false);
  const [faceScanLoading, setFaceScanLoading] = useState(false);

  // Voice narration per step
  useEffect(() => {
    const map: Record<ReverifyStep, string> = {
      idle: "reverify_idle",
      search: "reverify_search",
      face_scanning: "reverify_face_scan",
      loading_url: "reverify_loading_url",
      generating_url: "reverify_loading_url",
      verify_link: "reverify_link",
      checking: "reverify_checking",
      submitting: "reverify_submitting",
      done_success: "reverify_done_success",
      done_failed: "reverify_done_failed",
    } as any;
    speakStep(map[step] as any);
  }, [step]);

  // Auto-check whitelist when returning from GoodDollar
  useEffect(() => {
    let leftApp = false;
    const handleVisibility = () => {
      if (document.visibilityState === "hidden" && matchedBinding && step === "verify_link") {
        leftApp = true;
      }
      if (document.visibilityState === "visible" && leftApp && matchedBinding && step === "verify_link") {
        leftApp = false;
        checkWhitelist();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [matchedBinding, step]);

  const loadCandidates = async (query: string = "") => {
    setLoadingCandidates(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-key", {
        body: { action: "list_reverify_candidates", query },
      });
      if (error) throw error;
      setCandidates((data?.candidates || []) as Candidate[]);
    } catch (err: any) {
      console.error("Load candidates failed:", err);
      toast({ title: "লিস্ট লোড ব্যর্থ", description: err.message, variant: "destructive" });
    } finally {
      setLoadingCandidates(false);
    }
  };

  const startReverify = async () => {
    setStep("search");
    setSearchQuery("");
    setShowFaceScan(false);
    await loadCandidates("");
  };

  // Optional: scan face to auto-find candidate
  const handleFaceScanCapture = async (photoBlob: Blob) => {
    setFaceScanLoading(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
      });
      reader.readAsDataURL(photoBlob);
      const photoBase64 = await base64Promise;

      const { data, error } = await supabase.functions.invoke("face-match", {
        body: { capturedPhotoBase64: photoBase64, source: "reverify", displayName: user?.display_name || undefined },
      });
      if (error) throw error;
      if (!data?.match) {
        toast({ title: "❌ ফেস ম্যাচ হয়নি", description: "নাম দিয়ে সার্চ করে দেখুন।", variant: "destructive" });
        setStep("search");
        setShowFaceScan(false);
        return;
      }
      // Auto-select matched candidate
      const matched = data.match;
      setMatchedBinding({
        id: matched.id,
        wallet_address: matched.wallet_address,
        face_photo_url: matched.face_photo_url,
        user_id: matched.user_id,
      });
      setVerifyUrl(data.verifyUrl);
      setStep("verify_link");
      setShowFaceScan(false);
      toast({ title: "✅ ফেস ম্যাচ হয়েছে!", description: "ভেরিফাই লিঙ্ক রেডি।" });
    } catch (err: any) {
      toast({ title: "স্ক্যান ব্যর্থ", description: err.message, variant: "destructive" });
      setStep("search");
      setShowFaceScan(false);
    } finally {
      setFaceScanLoading(false);
    }
  };

  const handleFaceScanCancel = () => {
    setShowFaceScan(false);
    setStep("search");
  };

  const handleSelectCandidate = async (cand: Candidate) => {
    if (!user) return;
    setStep("loading_url");
    setStatusMessage("URL তৈরি হচ্ছে...");
    try {
      // Pre-check: already whitelisted?
      try {
        const provider = new ethers.JsonRpcProvider(CELO_RPC);
        const contract = new ethers.Contract(GD_IDENTITY_ADDRESS, GD_IDENTITY_ABI, provider);
        const alreadyWhitelisted = await contract.isWhitelisted(cand.wallet_address);
        if (alreadyWhitelisted) {
          setStep("done_failed");
          setStatusMessage("⚠️ এই ওয়ালেট এখনও হোয়াইটলিস্টেড আছে। রি-ভেরিফাই এর দরকার নেই।");
          toast({ title: "⚠️ ওয়ালেট ইতিমধ্যে হোয়াইটলিস্টেড", variant: "destructive" });
          setTimeout(resetState, 4000);
          return;
        }
      } catch (err) {
        console.warn("Pre-whitelist check failed, proceeding anyway:", err);
      }

      const { data, error } = await supabase.functions.invoke("generate-key", {
        body: { action: "get_reverify_url", walletAddress: cand.wallet_address, displayName: user.display_name || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setMatchedBinding({ id: cand.id, wallet_address: cand.wallet_address, face_photo_url: cand.face_photo_url, user_id: user.id, face_label: cand.face_label });
      setVerifyUrl(data.verifyUrl);
      setStatusMessage(null);
      setStep("verify_link");
    } catch (err: any) {
      console.error("get_reverify_url error:", err);
      toast({ title: "URL তৈরি ব্যর্থ", description: err.message, variant: "destructive" });
      setStep("done_failed");
      setStatusMessage("❌ URL তৈরি ব্যর্থ হয়েছে।");
      setTimeout(resetState, 3000);
    }
  };

  const checkWhitelist = async () => {
    if (!matchedBinding) return;
    setStep("checking");
    try {
      const provider = new ethers.JsonRpcProvider(CELO_RPC);
      const contract = new ethers.Contract(GD_IDENTITY_ADDRESS, GD_IDENTITY_ABI, provider);
      const isWhitelisted = await contract.isWhitelisted(matchedBinding.wallet_address);

      if (isWhitelisted) {
        // Success! Complete re-verify
        await completeReverify();
      } else {
        setStep("done_failed");
        setStatusMessage("❌ ভেরিফাই হয়নি। আবার চেষ্টা করুন।");
        setTimeout(resetState, 3000);
      }
    } catch (err) {
      console.error("Whitelist check error:", err);
      setStep("done_failed");
      setStatusMessage("⚠️ চেক করতে সমস্যা হয়েছে।");
      setTimeout(resetState, 3000);
    }
  };

  const completeReverify = async () => {
    if (!matchedBinding || !user) return;
    setStep("submitting");
    try {
      // Get reward rate from settings
      const settings = await getPublicSettings();
      // BDT add = admin-configured rewardRate (TK per re-verified account).
      // This matches the "রেট (TK/key)" field in Admin Panel exactly.
      const rewardRate = Number(settings.rewardRate) || 0;

      // All logic handled server-side via edge function (reliable, bypasses RLS)
      const { data: result, error: rebindError } = await supabase.functions.invoke("generate-key", {
        body: {
          action: "rebind_wallet",
          walletAddress: matchedBinding.wallet_address,
          rewardRate,
        },
      });

      if (rebindError) throw rebindError;
      if (result?.error) throw new Error(result.error);

      // Rebind succeeded — show success FIRST so any post-success refresh
      // hiccups (network/auth refresh) never flip the UI to red.
      const earnedTk = rewardRate;
      const earnedUsdt = +(rewardRate / (settings.usdtToBdtRate || 124)).toFixed(4);
      setStep("done_success");
      setStatusMessage(`🎉 অ্যাকাউন্ট Complete! +${earnedUsdt} USDT (≈ ৳${earnedTk}) যোগ হয়েছে`);
      toast({ title: `🎉 ১টি অ্যাকাউন্ট সম্পন্ন! +${earnedUsdt} USDT (৳${earnedTk}) যোগ হয়েছে` });
      setTimeout(resetState, 4000);

      // Best-effort refresh — never throw
      try { await refreshUser(); } catch (e) { console.warn("refreshUser failed (non-fatal):", e); }
      try { queryClient.invalidateQueries({ queryKey: ["user-transactions"] }); } catch (e) { console.warn("invalidate failed (non-fatal):", e); }
    } catch (err: any) {
      toast({ title: "ব্যর্থ", description: err.message, variant: "destructive" });
      setStep("done_failed");
      setStatusMessage("❌ সাবমিট ব্যর্থ।");
      setTimeout(resetState, 3000);
    }
  };

  const resetState = () => {
    setMatchedBinding(null);
    setVerifyUrl(null);
    setStep("idle");
    setStatusMessage(null);
    setCandidates([]);
    setSearchQuery("");
    setShowFaceScan(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-3xl border-2 border-[hsl(var(--amber))]/30 relative overflow-hidden"
    >
      <motion.div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[hsl(var(--amber))]/10 via-[hsl(var(--orange))]/5 to-[hsl(var(--pink))]/8"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 4, repeat: Infinity }}
      />

      <div className="relative z-10 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[hsl(var(--amber))] to-[hsl(var(--orange))] flex items-center justify-center shadow-lg shadow-[hsl(var(--amber))]/30"
          >
            <RefreshCcw className="w-5 h-5 text-primary-foreground" />
          </motion.div>
          <div>
            <h2 className="text-sm font-black text-[hsl(var(--amber))]">🔄 রি-ভেরিফাই</h2>
            <p className="text-[10px] text-muted-foreground">ফেস স্ক্যান করে ওয়ালেট রি-ভেরিফাই করুন</p>
          </div>
        </div>

        {/* Bengali reassuring text */}
        <div className="bg-gradient-to-br from-[hsl(var(--amber))]/15 to-[hsl(var(--emerald))]/10 border border-[hsl(var(--amber))]/30 rounded-xl p-3 space-y-2">
          <p className="text-[12px] font-black text-[hsl(var(--amber))] text-center">
            📌 Re-verify করলেই ১টি অ্যাকাউন্ট Complete হয় এবং টাকা/USDT যোগ হয়
          </p>
          <p className="text-[10px] text-muted-foreground leading-relaxed text-center">
            ✨ প্রতিবার Re-verify করলেই আপনার Balance বাড়বে — যত বেশি Re-verify, তত বেশি ইনকাম! 💰<br/>
            ⏰ প্রথম ভেরিফাই করার ৩-৪ দিন পর আবার Re-verify করুন, সাথে সাথে টাকা/USDT ওয়ালেটে যোগ হবে।
          </p>
        </div>

        {/* Idle - Start button */}
        {step === "idle" && (
          <motion.button
            id="reverify-start-btn"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={startReverify}
            className="relative w-full overflow-hidden rounded-3xl px-5 py-5 text-primary-foreground font-black shadow-[0_20px_50px_-12px_hsl(var(--orange)/0.6)] ring-2 ring-[hsl(var(--amber))]/40"
            style={{
              backgroundImage:
                "linear-gradient(135deg, hsl(var(--amber)) 0%, hsl(var(--orange)) 45%, hsl(var(--pink)) 100%)",
            }}
          >
            {/* shimmer sweep */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-[-20deg]"
              animate={{ left: ["-30%", "130%"] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
            {/* pulsing glow ring */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-3xl"
              animate={{ boxShadow: [
                "0 0 0 0 hsl(var(--amber) / 0.55)",
                "0 0 0 14px hsl(var(--amber) / 0)",
              ] }}
              transition={{ duration: 1.8, repeat: Infinity }}
            />

            <div className="relative flex items-center justify-center gap-3">
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/25 backdrop-blur ring-2 ring-white/40"
              >
                <RefreshCcw className="h-5 w-5 text-white" />
              </motion.div>
              <div className="text-left leading-tight">
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-yellow-200" />
                  <span className="text-[10px] font-black tracking-[0.18em] uppercase text-white/90">
                    Tap to Earn
                  </span>
                </div>
                <p className="text-base font-black text-white drop-shadow">
                  🔄 Re-Verify শুরু করুন
                </p>
                <p className="text-[10px] font-bold text-white/85">
                  ফেস স্ক্যান → instant ৳/USDT balance এ যোগ
                </p>
              </div>
              <Sparkles className="h-5 w-5 text-yellow-200 animate-pulse ml-auto" />
            </div>
          </motion.button>
        )}

        {/* Name search + candidate list */}
        {step === "search" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-[hsl(var(--amber))] flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5" /> নাম দিয়ে খুঁজুন
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); loadCandidates(e.target.value); }}
                placeholder="যেমন: সামিউল, রহিম..."
                className="w-full px-3 py-2.5 rounded-xl bg-background border-2 border-border focus:border-[hsl(var(--amber))] outline-none text-sm font-bold text-foreground placeholder:text-muted-foreground/60 transition-colors"
              />
              <p className="text-[10px] text-muted-foreground">
                নাম লিখে সার্চ করুন অথবা নিচ থেকে আপনার সেভ করা ফেস সিলেক্ট করুন।
              </p>
            </div>

            {loadingCandidates ? (
              <div className="flex items-center gap-2 justify-center py-6 text-sm text-[hsl(var(--amber))]">
                <Loader2 className="w-4 h-4 animate-spin" /> লোড হচ্ছে...
              </div>
            ) : candidates.length === 0 ? (
              <div className="text-center py-6 text-xs text-muted-foreground">
                {searchQuery
                  ? "❌ এই নামে কোনো পেন্ডিং রি-ভেরিফাই অ্যাকাউন্ট পাওয়া যায়নি।"
                  : "⚠️ এখনো কোনো পেন্ডিং রি-ভেরিফাই অ্যাকাউন্ট নেই।"}
              </div>
            ) : (
              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectCandidate(c)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-secondary/60 hover:bg-secondary border border-border/50 hover:border-[hsl(var(--amber))]/50 transition-all text-left"
                  >
                    <img
                      src={c.face_photo_url}
                      alt={c.face_label || "face"}
                      className="w-12 h-12 rounded-lg object-cover border border-border shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-foreground flex items-center gap-1.5 truncate">
                        <User className="w-3.5 h-3.5 text-[hsl(var(--amber))] shrink-0" />
                        {c.face_label || <span className="italic text-muted-foreground">নাম দেওয়া নেই</span>}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono truncate">
                        {c.wallet_address}
                      </p>
                    </div>
                    <RefreshCcw className="w-4 h-4 text-[hsl(var(--amber))] shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {/* Optional: Face scan (hidden by default) */}
            <div className="rounded-xl border border-[hsl(var(--cyan))]/30 overflow-hidden">
              <button
                onClick={() => setShowFaceScan((v) => !v)}
                className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-[hsl(var(--cyan))]/10 to-[hsl(var(--blue))]/10 hover:from-[hsl(var(--cyan))]/15"
              >
                <span className="flex items-center gap-2 text-xs font-black text-[hsl(var(--cyan))]">
                  <Camera className="w-4 h-4" /> নাম মনে নেই? ফেস স্ক্যান করে খুঁজুন
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-[hsl(var(--cyan))] transition-transform ${showFaceScan ? "rotate-180" : ""}`}
                />
              </button>
              <AnimatePresence>
                {showFaceScan && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-3 bg-background/40">
                      <p className="text-[10px] text-muted-foreground mb-2 text-center">
                        📸 ক্যামেরায় মুখ দেখান, আপনার সেভ করা ফেসগুলোর সাথে মিলিয়ে অটো খুঁজে দেবো।
                      </p>
                      <FaceCapture
                        onCapture={handleFaceScanCapture}
                        onCancel={handleFaceScanCancel}
                        isUploading={faceScanLoading}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Loading verify URL */}
        {step === "loading_url" && (
          <div className="flex items-center gap-2 justify-center py-4 text-sm text-[hsl(var(--amber))]">
            <Loader2 className="w-4 h-4 animate-spin" /> {statusMessage || "URL তৈরি হচ্ছে..."}
          </div>
        )}

        {/* Generating URL */}
        {step === "generating_url" && matchedBinding && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-secondary/60 rounded-xl border border-border/50">
              <img
                src={matchedBinding.face_photo_url}
                alt="Matched face"
                className="w-10 h-10 rounded-xl object-cover border border-border"
              />
              <div>
                <p className="text-xs font-bold text-[hsl(var(--emerald))]">✅ ওয়ালেট পাওয়া গেছে!</p>
                <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">
                  {matchedBinding.wallet_address}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> URL তৈরি হচ্ছে...
            </div>
          </div>
        )}

        {/* Verify link */}
        {step === "verify_link" && verifyUrl && matchedBinding && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-secondary/60 rounded-xl border border-border/50">
              <img
                src={matchedBinding.face_photo_url}
                alt="Matched face"
                className="w-10 h-10 rounded-xl object-cover border border-border"
              />
              <div>
                <p className="text-xs font-bold">ম্যাচ করা ওয়ালেট</p>
                <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">
                  {matchedBinding.wallet_address}
                </p>
              </div>
            </div>
            <a
              href={verifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-[hsl(var(--amber))] to-[hsl(var(--orange))] text-primary-foreground text-sm font-black"
            >
              <ExternalLink className="w-4 h-4" /> Face Verification খুলুন
            </a>
            <p className="text-[10px] text-muted-foreground text-center">
              ভেরিফাই করে ফিরে আসলে অটো চেক হবে
            </p>
            <button
              onClick={checkWhitelist}
              className="w-full py-2 rounded-xl bg-secondary text-xs font-bold"
            >
              ম্যানুয়াল চেক করুন
            </button>
          </div>
        )}

        {/* Checking whitelist */}
        {step === "checking" && (
          <div className="flex items-center gap-2 text-sm text-[hsl(var(--cyan))] py-2">
            <Loader2 className="w-4 h-4 animate-spin" /> হোয়াইটলিস্ট চেক হচ্ছে...
          </div>
        )}

        {/* Submitting */}
        {step === "submitting" && (
          <div className="flex items-center gap-2 text-sm text-[hsl(var(--emerald))] py-2">
            <Loader2 className="w-4 h-4 animate-spin" /> সেভ হচ্ছে...
          </div>
        )}

        {/* Done */}
        {statusMessage && (step === "done_success" || step === "done_failed") && (
          <div
            className={`flex items-center gap-2 text-sm font-bold py-2 ${
              step === "done_success" ? "text-[hsl(var(--emerald))]" : "text-destructive"
            }`}
          >
            {step === "done_success" ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {statusMessage}
          </div>
        )}

        {/* Cancel button during active flow */}
        {step !== "idle" && step !== "done_success" && step !== "done_failed" && (
          <button
            onClick={resetState}
            className="w-full py-2 rounded-xl bg-secondary/60 text-xs text-muted-foreground"
          >
            বাতিল করুন
          </button>
        )}
      </div>
    </motion.div>
  );
}
