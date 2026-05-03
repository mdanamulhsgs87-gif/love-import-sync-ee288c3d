import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCcw, ExternalLink, Loader2, CheckCircle, XCircle, Camera, Sparkles } from "lucide-react";
import { ethers } from "ethers";
import { getPublicSettings } from "@/lib/api";
import { FaceCapture } from "./FaceCapture";
import { supabase } from "@/integrations/supabase/client";

const GD_IDENTITY_ADDRESS = "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42";
const CELO_RPC = "https://forno.celo.org";
const GD_IDENTITY_ABI = [
  "function isWhitelisted(address account) view returns (bool)",
];

type ReverifyStep =
  | "idle"
  | "photo_capture"
  | "matching"
  | "generating_url"
  | "verify_link"
  | "checking"
  | "submitting"
  | "done_success"
  | "done_failed";

type MatchedBinding = {
  id: string;
  wallet_address: string;
  face_photo_url: string;
  user_id: number;
};

export function ReverifySection() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<ReverifyStep>("idle");
  const [matchedBinding, setMatchedBinding] = useState<MatchedBinding | null>(null);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [capturedPhotoBase64, setCapturedPhotoBase64] = useState<string | null>(null);

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

  const startReverify = () => {
    setStep("photo_capture");
  };

  const handleFaceScan = async (photoBlob: Blob) => {
    if (!user) return;
    setStep("matching");

    try {
      // AI face matching — find the bound wallet for this face
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
      });
      reader.readAsDataURL(photoBlob);
      const base64 = await base64Promise;
      setCapturedPhotoBase64(base64);

      // Search ALL bindings (any user can re-verify any face)
      // verifyUrl is generated server-side — private_key never reaches client
      const { data, error } = await supabase.functions.invoke("face-match", {
        body: { capturedPhotoBase64: base64, displayName: user.display_name || undefined, source: "reverify" },
      });

      if (error) throw error;

      if (!data?.match) {
        const reason = data?.reason || "unknown";
        let msg = "❌ কোনো ম্যাচ পাওয়া যায়নি।";
        if (reason === "no_bindings") msg = "❌ কোনো ওয়ালেট বাইন্ডিং নেই।";
        if (reason === "no_match_found") msg = "❌ ফেস ম্যাচ হয়নি। আবার চেষ্টা করুন।";

        setStep("done_failed");
        setStatusMessage(msg);
        toast({ title: msg, variant: "destructive" });
        setTimeout(resetState, 3000);
        return;
      }

      const matched = data.match as MatchedBinding;
      setMatchedBinding(matched);

      // Pre-check: already whitelisted means no re-verify needed
      setStatusMessage("হোয়াইটলিস্ট চেক হচ্ছে...");
      try {
        const provider = new ethers.JsonRpcProvider(CELO_RPC);
        const contract = new ethers.Contract(GD_IDENTITY_ADDRESS, GD_IDENTITY_ABI, provider);
        const alreadyWhitelisted = await contract.isWhitelisted(matched.wallet_address);

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

      // verifyUrl already generated server-side
      setVerifyUrl(data.verifyUrl);
      setStep("verify_link");
    } catch (err: any) {
      console.error("Face match error:", err);
      toast({ title: "ফেস ম্যাচ ব্যর্থ", description: err.message, variant: "destructive" });
      setStep("done_failed");
      setStatusMessage("❌ ফেস ম্যাচ ব্যর্থ হয়েছে।");
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
      const rewardRate = settings.rewardRate || 0;

      // All logic handled server-side via edge function (reliable, bypasses RLS)
      const { data: result, error: rebindError } = await supabase.functions.invoke("generate-key", {
        body: {
          action: "rebind_wallet",
          walletAddress: matchedBinding.wallet_address,
          rewardRate,
        },
      });

      if (rebindError) throw rebindError;

      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ["user-transactions"] });

      const earnedTk = rewardRate;
      setStep("done_success");
      setStatusMessage(`✅ রি-ভেরিফাই সফল! +${earnedTk} TK`);
      toast({ title: `✅ রি-ভেরিফাই সম্পন্ন! +${earnedTk} TK যোগ হয়েছে` });
      setTimeout(resetState, 4000);
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
    setCapturedPhotoBase64(null);
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
        <div className="bg-[hsl(var(--emerald))]/10 border border-[hsl(var(--emerald))]/20 rounded-xl p-3">
          <p className="text-[11px] text-foreground/80 leading-relaxed text-center">
            🔒 ক্যামেরায় মুখ ধরলেই অটো স্ক্যান হয়ে আপনার ওয়ালেট খুঁজে বের করবে। দ্রুত, নিরাপদ ও সম্পূর্ণ এনক্রিপ্টেড।
          </p>
        </div>

        {/* Idle - Start button */}
        {step === "idle" && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={startReverify}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[hsl(var(--amber))] to-[hsl(var(--orange))] text-primary-foreground text-sm font-black flex items-center justify-center gap-2 shadow-lg"
          >
            <Camera className="w-4 h-4" />
            ফেস স্ক্যান করে রি-ভেরিফাই শুরু
          </motion.button>
        )}

        {/* Face capture */}
        {step === "photo_capture" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center">
              📸 আপনার মুখ স্ক্যান করুন — সিস্টেম আপনার ওয়ালেট খুঁজে বের করবে
            </p>
            <FaceCapture onCapture={handleFaceScan} onCancel={resetState} />
          </div>
        )}

        {/* Matching */}
        {step === "matching" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <Sparkles className="w-8 h-8 text-[hsl(var(--amber))]" />
            </motion.div>
            <div className="flex items-center gap-2 text-sm text-[hsl(var(--amber))]">
              <Loader2 className="w-4 h-4 animate-spin" />
              দয়া করে অপেক্ষা করুন, চেক হচ্ছে...
            </div>
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
        {step !== "idle" && step !== "done_success" && step !== "done_failed" && step !== "photo_capture" && (
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
