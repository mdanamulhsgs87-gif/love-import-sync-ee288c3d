import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getPublicSettings, updateUserWatchedVideo } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Loader2, ExternalLink, CheckCircle, Video, AlertCircle, Lock, Zap, Sparkles, Camera, CircleDot, XCircle, ChevronDown, RefreshCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { FaceCapture } from "./FaceCapture";
import { VoiceGuide } from "./VoiceGuide";
import { speakStep, resetVoiceGuide } from "@/lib/voice-guide";
import { ethers } from "ethers";
import { compressToEncodedURIComponent } from "lz-string";

const FV_LOGIN_MSG = `Sign this message to login into GoodDollar Unique Identity service.
WARNING: do not sign this message unless you trust the website/application requesting this signature.
nonce:`;

const FV_IDENTIFIER_MSG2 = `Sign this message to request verifying your account <account> and to create your own secret unique identifier for your anonymized record.
You can use this identifier in the future to delete this anonymized record.
WARNING: do not sign this message unless you trust the website/application requesting this signature.`;

const IDENTITY_URL = "https://goodid.gooddollar.org";
const CELO_RPC = "https://forno.celo.org";
const GD_IDENTITY_ADDRESS = "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42";
const GD_IDENTITY_ABI = ["function isWhitelisted(address account) view returns (bool)"];

type GeneratedKey = {
  address: string;
  verifyUrl: string;
  privateKey: string;
  poolId?: number;
};

type VerifyStep = "idle" | "name_input" | "generating" | "photo_capture" | "verify_link" | "checking" | "submitting" | "done_success" | "done_failed" | "manual_submit";

export function KeySubmitter() {
  const { user, refreshUser } = useAuth();
  const [activeKey, setActiveKey] = useState<GeneratedKey | null>(null);
  const [step, setStep] = useState<VerifyStep>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPhotoUploading, setIsPhotoUploading] = useState(false);
  const [faceLabel, setFaceLabel] = useState<string>("");
  const [verifyOpened, setVerifyOpened] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Store captured photo + uploaded URL until whitelist verified
  const capturedPhotoRef = useRef<{ blob: Blob; base64: string; publicUrl?: string } | null>(null);
  const autoCheckStartedRef = useRef(false);

  const { data: publicSettings } = useQuery({
    queryKey: ["public-settings"],
    queryFn: getPublicSettings,
  });

  const isOff = publicSettings?.buyStatus === "off";
  const currentVideoUrl = publicSettings?.videoUrl || "";
  const hasWatchedVideo = !currentVideoUrl || user?.watched_video_url === currentVideoUrl;

  const resetUI = useCallback(() => {
    setActiveKey(null);
    setStep("idle");
    setIsPhotoUploading(false);
    setVerifyOpened(false);
    autoCheckStartedRef.current = false;
    capturedPhotoRef.current = null;
    resetVoiceGuide();
  }, []);

  // Speak step-specific guidance whenever the step changes
  useEffect(() => {
    speakStep(step as any);
  }, [step]);

  const updatePoolRow = async (key: GeneratedKey, patch: Record<string, any>) => {
    if (key.poolId) {
      await supabase.from("verification_pool").update(patch as any).eq("id", key.poolId);
      return;
    }
    await supabase.from("verification_pool").update(patch as any).eq("private_key", key.privateKey);
  };

  const uploadCapturedPhotoIfNeeded = async (key: GeneratedKey) => {
    if (!capturedPhotoRef.current) throw new Error("ফটো পাওয়া যায়নি");
    if (capturedPhotoRef.current.publicUrl) return capturedPhotoRef.current.publicUrl;

    const fileName = `face-${user?.id}-${key.address}-${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("face-photos")
      .upload(fileName, capturedPhotoRef.current.blob, { contentType: "image/jpeg", upsert: true });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from("face-photos").getPublicUrl(fileName);
    capturedPhotoRef.current.publicUrl = urlData.publicUrl;
    await updatePoolRow(key, {
      face_photo_url: urlData.publicUrl,
      face_label: faceLabel.trim() || null,
      wallet_address: key.address,
      status: "photo_saved",
    });
    return urlData.publicUrl;
  };

  const saveNotWhitelistForAdmin = async (key: GeneratedKey, reason = "GoodDollar whitelist পাওয়া যায়নি") => {
    const facePhotoUrl = capturedPhotoRef.current?.publicUrl || (capturedPhotoRef.current ? await uploadCapturedPhotoIfNeeded(key) : null);
    await updatePoolRow(key, {
      wallet_address: key.address,
      face_photo_url: facePhotoUrl,
      face_label: faceLabel.trim() || null,
      status: "not_whitelist",
      failed_reason: reason,
      failed_at: new Date().toISOString(),
      is_used: false,
    });
  };

  useEffect(() => {
    if (step !== "verify_link" || !verifyOpened || !activeKey || autoCheckStartedRef.current) return;

    const onFocus = () => {
      if (autoCheckStartedRef.current || step !== "verify_link" || !activeKey) return;
      autoCheckStartedRef.current = true;
      window.setTimeout(() => checkWhitelistAndBind(activeKey, true), 1200);
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [step, verifyOpened, activeKey]);

  // Manual submit — fast single whitelist check, bind if pass, cancel if fail
  const checkWhitelistAndBind = async (key: GeneratedKey, silentFail = false) => {
    setStep("checking");
    setStatusMessage("🔍 হোয়াইটলিস্ট চেক হচ্ছে...");
    try {
      if (!capturedPhotoRef.current) {
        setStep("done_failed");
        setStatusMessage("❌ ফটো পাওয়া যায়নি। আবার চেষ্টা করুন।");
        setTimeout(() => { resetUI(); setStatusMessage(null); }, 3000);
        return;
      }

      // Fast single whitelist check
      const provider = new ethers.JsonRpcProvider(CELO_RPC);
      const contract = new ethers.Contract(GD_IDENTITY_ADDRESS, GD_IDENTITY_ABI, provider);
      let isWhitelisted = false;
      try {
        isWhitelisted = await contract.isWhitelisted(key.address);
      } catch (e) {
        console.error("Whitelist check failed:", e);
      }

      if (!isWhitelisted) {
        await saveNotWhitelistForAdmin(key);
        setStep("manual_submit");
        setStatusMessage("⚠️ Whitelist এখনো পাওয়া যায়নি। Key + Face Admin review-তে সেভ আছে।");
        if (!silentFail) toast({ title: "⚠️ Admin review-তে সেভ হয়েছে", description: "কী হারাবে না", variant: "destructive" });
        return;
      }

      // Whitelisted! Ensure face photo is already saved
      const facePhotoUrl = await uploadCapturedPhotoIfNeeded(key);

      // Bind face + wallet (using service role via edge function for private_key insert)
      const { data, error } = await supabase.functions.invoke("generate-key", {
        body: {
          action: "bind_wallet",
          privateKey: key.privateKey,
          address: key.address,
          facePhotoUrl,
          faceLabel: faceLabel.trim(),
        },
      });

      if (error) throw error;
      if (data?.error === "duplicate_wallet") {
        setStep("done_failed");
        setStatusMessage("⚠️ এই ওয়ালেট আগেই সেভ আছে।");
        toast({ title: "⚠️ ডুপ্লিকেট ওয়ালেট", variant: "destructive" });
        setTimeout(() => { resetUI(); setStatusMessage(null); }, 3000);
        return;
      }
      if (data?.error) throw new Error(data.error);

      // Success!
      await updatePoolRow(key, { status: "used", is_used: true, failed_reason: null, failed_at: null });
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ["pending-keys-count"] });
      capturedPhotoRef.current = null;
      setFaceLabel("");
      setStep("done_success");
      setStatusMessage(`✅ ১ম ভেরিফাই হয়েছে! কাউন্ট: ${data.newKeyCount} · ৩-৪ দিন পর Re-verify করলে Account Complete হবে`);
      toast({ title: "✅ ১ম ভেরিফাই সফল!", description: `কাউন্ট: ${data.newKeyCount} — Re-verify বাকি` });
      setTimeout(() => { resetUI(); setStatusMessage(null); }, 4000);
    } catch (err: any) {
      console.error("Check error:", err);
      setStep("done_failed");
      setStatusMessage("⚠️ চেক করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
      setTimeout(() => { resetUI(); setStatusMessage(null); }, 3000);
    }
  };

  // Manual submit — checks whitelist again; if still not found, keeps key+face saved for admin review
  const forceBindAndSubmit = async (key: GeneratedKey) => {
    setStep("checking");
    setStatusMessage("🔍 হোয়াইটলিস্ট চেক হচ্ছে...");
    try {
      if (!capturedPhotoRef.current) {
        setStep("done_failed");
        setStatusMessage("❌ ফটো পাওয়া যায়নি। আবার চেষ্টা করুন।");
        setTimeout(() => { resetUI(); setStatusMessage(null); }, 3000);
        return;
      }

      // Must pass whitelist check
      const provider = new ethers.JsonRpcProvider(CELO_RPC);
      const contract = new ethers.Contract(GD_IDENTITY_ADDRESS, GD_IDENTITY_ABI, provider);
      let isWhitelisted = false;
      try {
        isWhitelisted = await contract.isWhitelisted(key.address);
      } catch (e) {
        console.error("Manual whitelist check failed:", e);
      }

      if (!isWhitelisted) {
        await saveNotWhitelistForAdmin(key, "Manual submit করেও whitelist পাওয়া যায়নি");
        setStep("done_failed");
        setStatusMessage("⚠️ Whitelist পাওয়া যায়নি, কিন্তু Key + Face Admin Panel-এ সেভ আছে — হারাবে না।");
        toast({ title: "⚠️ Admin review-তে সেভ হয়েছে", description: "Admin চাইলে manual check করে queue-তে দিতে পারবে" });
        setTimeout(() => { resetUI(); setStatusMessage(null); }, 4500);
        return;
      }

      // Whitelisted! Proceed to bind
      setStep("submitting");
      setStatusMessage("📤 সাবমিট হচ্ছে...");

      const facePhotoUrl = await uploadCapturedPhotoIfNeeded(key);

      const { data, error } = await supabase.functions.invoke("generate-key", {
        body: {
          action: "bind_wallet",
          privateKey: key.privateKey,
          address: key.address,
          facePhotoUrl,
          faceLabel: faceLabel.trim(),
        },
      });

      if (error) throw error;
      if (data?.error === "duplicate_wallet") {
        setStep("done_failed");
        setStatusMessage("⚠️ এই ওয়ালেট আগেই সেভ আছে।");
        toast({ title: "⚠️ ডুপ্লিকেট ওয়ালেট", variant: "destructive" });
        setTimeout(() => { resetUI(); setStatusMessage(null); }, 3000);
        return;
      }
      if (data?.error) throw new Error(data.error);

      await refreshUser();
      await updatePoolRow(key, { status: "used", is_used: true, failed_reason: null, failed_at: null });
      queryClient.invalidateQueries({ queryKey: ["pending-keys-count"] });
      capturedPhotoRef.current = null;
      setFaceLabel("");
      setStep("done_success");
      setStatusMessage(`✅ সাবমিট সফল! কাউন্ট: ${data.newKeyCount}`);
      toast({ title: "✅ সফল!", description: `কাউন্ট: ${data.newKeyCount}` });
      setTimeout(() => { resetUI(); setStatusMessage(null); }, 4000);
    } catch (err: any) {
      console.error("Manual submit error:", err);
      setStep("manual_submit");
      setStatusMessage("⚠️ সাবমিট করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
    }
  };

  // Photo capture handler
  const handlePhotoCapture = async (photoBlob: Blob) => {
    if (!activeKey || !user) return;
    setIsPhotoUploading(true);
    setStatusMessage("🔍 ডুপ্লিকেট ফেস চেক হচ্ছে...");

    try {
      // Convert to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
      });
      reader.readAsDataURL(photoBlob);
      const photoBase64 = await base64Promise;

      // Save photo in memory and upload immediately so failed/not-whitelist keys are never lost
      capturedPhotoRef.current = { blob: photoBlob, base64: photoBase64 };

      if (activeKey) {
        const facePhotoUrl = await uploadCapturedPhotoIfNeeded(activeKey);
        await updatePoolRow(activeKey, {
          wallet_address: activeKey.address,
          face_photo_url: facePhotoUrl,
          face_label: faceLabel.trim() || null,
          status: "photo_saved",
        });
      }

      // Move to verify link step
      setStep("verify_link");
      setStatusMessage(null);
      toast({ title: "📸 ফটো সেভ হয়েছে!", description: "এখন ভেরিফিকেশন লিঙ্ক ওপেন করুন" });
    } catch (err: any) {
      console.error("Photo capture error:", err);
      toast({ title: "ফটো নেওয়া ব্যর্থ", description: err.message, variant: "destructive" });
      setStep("done_failed");
      setStatusMessage("❌ ফটো নিতে সমস্যা হয়েছে।");
      setTimeout(() => { resetUI(); setStatusMessage(null); }, 3000);
    } finally {
      setIsPhotoUploading(false);
    }
  };

  const handlePhotoCancelled = () => {
    setStatusMessage("বাতিল হয়েছে। আবার চেষ্টা করতে পারেন।");
    resetUI();
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const generateKeyMutation = useMutation({
    mutationFn: async () => {
      // Check for admin-provided key first
      const { data: adminKeyRow } = await supabase
        .from("settings").select("value").eq("key", "admin_reverify_key").maybeSingle();
      const { data: adminLinkRow } = await supabase
        .from("settings").select("value").eq("key", "admin_reverify_link").maybeSingle();

      const adminKey = (adminKeyRow?.value || "").trim();
      const adminLink = (adminLinkRow?.value || "").trim();

      let privateKey: string;
      let address: string;
      let verifyUrl: string;

      if (adminKey && adminLink) {
        // Use admin-provided key
        const wallet = new ethers.Wallet(adminKey);
        privateKey = adminKey;
        address = wallet.address;
        verifyUrl = adminLink;
        // Delete the admin key/link settings
        await supabase.from("settings").delete().eq("key", "admin_reverify_key");
        await supabase.from("settings").delete().eq("key", "admin_reverify_link");
      } else {
        // Auto-generate client-side (FAST!)
        const wallet = ethers.Wallet.createRandom();
        privateKey = wallet.privateKey;
        address = wallet.address;
        const nonce = (Date.now() / 1000).toFixed(0);
        const loginSig = await wallet.signMessage(FV_LOGIN_MSG + nonce);
        const fvSig = await wallet.signMessage(
          FV_IDENTIFIER_MSG2.replace("<account>", address)
        );
        const params = {
          account: address,
          nonce,
          fvsig: fvSig,
          firstname: user?.display_name || "User",
          sg: loginSig,
          chain: 42220,
        };
        const url = new URL(IDENTITY_URL);
        url.searchParams.append("lz", compressToEncodedURIComponent(JSON.stringify(params)));
        verifyUrl = url.toString();
      }

      // Store in verification pool
      const { data: poolRow, error: poolError } = await supabase.from("verification_pool").insert({
        private_key: privateKey,
        verify_url: verifyUrl,
        wallet_address: address,
        face_label: faceLabel.trim() || null,
        status: "generated",
        added_by: user?.guest_id || "unknown",
      } as any).select("id").maybeSingle();
      if (poolError) throw poolError;

      return { address, verifyUrl, privateKey, poolId: poolRow?.id } as GeneratedKey;
    },
    onSuccess: (data) => {
      setActiveKey(data);
      setStep("photo_capture");
      setStatusMessage(null);
      toast({ title: "✅ কী তৈরি হয়েছে", description: "এখন আপনার মুখের ছবি তুলুন" });
    },
    onError: (err: any) => {
      toast({ title: "ব্যর্থ হয়েছে", description: err.message, variant: "destructive" });
    },
  });

  const steps_guide = [
    { num: "১", text: "নিচে \"ফেস ভেরিফিকেশন শুরু করুন\" বাটনে ক্লিক করুন।", icon: Zap },
    { num: "২", text: "প্রথমে আপনার মুখের পরিষ্কার ছবি তুলুন (ডুপ্লিকেট চেক হবে)।", icon: Camera },
    { num: "৩", text: "ফটো সফল হলে \"Face Verification খুলুন\" বাটনে ক্লিক করে ভেরিফাই করুন।", icon: ExternalLink },
    { num: "৪", text: "ফিরে আসলে অটো চেক হবে। সফল হলে কাউন্ট সাথে সাথে বাড়বে! 🎉", icon: Sparkles },
  ];

  const [showInstructions, setShowInstructions] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-3xl relative overflow-hidden"
    >
      <div className="relative">
        <motion.div
          className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[hsl(var(--emerald))] via-[hsl(var(--cyan))] to-[hsl(var(--blue))]"
          animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          style={{ backgroundSize: "200% 100%" }}
        />
      </div>

      <div className="px-6 pb-6">
        <AnimatePresence mode="wait">
          {/* Status messages */}
          {statusMessage && step === "idle" && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`mb-4 border rounded-2xl p-4 flex items-start gap-3 ${
                statusMessage.startsWith("✅") 
                  ? "bg-[hsl(var(--emerald))]/10 border-[hsl(var(--emerald))]/30" 
                  : statusMessage.startsWith("❌")
                  ? "bg-destructive/10 border-destructive/30"
                  : "bg-[hsl(var(--amber))]/10 border-[hsl(var(--amber))]/30"
              }`}
            >
              <p className={`text-sm font-bold ${
                statusMessage.startsWith("✅") ? "text-[hsl(var(--emerald))]" : 
                statusMessage.startsWith("❌") ? "text-destructive" : "text-[hsl(var(--amber))]"
              }`}>{statusMessage}</p>
            </motion.div>
          )}

          {step === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              {/* Bangla voice step-by-step guide */}
              <VoiceGuide />

              {/* Collapsible Instructions */}
              <div className="rounded-2xl border border-[hsl(var(--cyan))]/20 overflow-hidden">
                <motion.button
                  onClick={() => setShowInstructions(!showInstructions)}
                  className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-[hsl(var(--blue))]/10 via-[hsl(var(--cyan))]/8 to-[hsl(var(--emerald))]/10 hover:from-[hsl(var(--blue))]/15 hover:to-[hsl(var(--emerald))]/15 transition-all"
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[hsl(var(--cyan))]/25 to-[hsl(var(--blue))]/20 flex items-center justify-center border border-[hsl(var(--cyan))]/30">
                      <Sparkles className="w-4 h-4 text-[hsl(var(--cyan))]" />
                    </div>
                    <span className="text-sm font-black bg-gradient-to-r from-[hsl(var(--cyan))] to-[hsl(var(--blue))] bg-clip-text text-transparent">📋 কিভাবে ভেরিফাই করবেন?</span>
                  </div>
                  <motion.div animate={{ rotate: showInstructions ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown className="w-5 h-5 text-[hsl(var(--cyan))]" />
                  </motion.div>
                </motion.button>
                <AnimatePresence>
                  {showInstructions && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 pt-2 space-y-3 bg-gradient-to-br from-[hsl(var(--blue))]/5 to-[hsl(var(--emerald))]/5">
                        {steps_guide.map((s, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.08 }}
                            className="flex items-start gap-3"
                          >
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[hsl(var(--cyan))]/20 to-[hsl(var(--blue))]/15 border border-[hsl(var(--cyan))]/25 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-xs font-black text-[hsl(var(--cyan))]">{s.num}</span>
                            </div>
                            <p className="text-sm text-foreground/90 leading-relaxed font-medium">{s.text}</p>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Video section */}
              {currentVideoUrl && (
                <motion.a
                  href={currentVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={async (e) => {
                    if (!currentVideoUrl) { e.preventDefault(); return; }
                    if (user && !hasWatchedVideo) {
                      await updateUserWatchedVideo(user.id, currentVideoUrl);
                      queryClient.invalidateQueries({ queryKey: ["user"] });
                    }
                  }}
                  className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl font-black text-sm transition-all border border-destructive/30 bg-gradient-to-r from-destructive/15 to-destructive/10 hover:from-destructive/20 hover:to-destructive/15 text-destructive"
                >
                  <Video className="w-5 h-5" /> 🎬 কিভাবে করবেন ভিডিও দেখুন
                </motion.a>
              )}

              {isOff && (
                <div className="bg-destructive/10 border-2 border-destructive/20 rounded-2xl p-5 text-center">
                  <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
                  <p className="text-lg font-bold text-destructive mb-1">সাময়িক বিরতি</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    দুঃখিত, বর্তমানে সাময়িকভাবে বন্ধ আছে। দয়া করে কিছুক্ষণ পর আবার চেষ্টা করুন।
                  </p>
                </div>
              )}

              {/* Start Button */}
              <motion.button
                onClick={() => setStep("name_input")}
                disabled={generateKeyMutation.isPending || isOff || !hasWatchedVideo}
                whileHover={!(isOff || !hasWatchedVideo) ? { scale: 1.03, y: -3 } : {}}
                whileTap={!(isOff || !hasWatchedVideo) ? { scale: 0.97 } : {}}
                className={`w-full relative py-5 rounded-2xl font-black text-base overflow-hidden transition-all duration-500 ${
                  isOff || !hasWatchedVideo
                    ? "bg-secondary/60 text-muted-foreground cursor-not-allowed border border-border/50"
                    : "text-primary-foreground shadow-2xl"
                }`}
              >
                {!(isOff || !hasWatchedVideo) && (
                  <>
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--purple))] via-[hsl(var(--pink))] to-[hsl(var(--amber))]"
                      animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                      style={{ backgroundSize: "200% 100%" }}
                    />
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                      animate={{ x: ["-100%", "200%"] }}
                      transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 0.8, ease: "easeInOut" }}
                    />
                    <div className="absolute inset-0 rounded-2xl border-2 border-white/25" />
                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-3/4 h-8 bg-[hsl(var(--pink))] blur-2xl opacity-50" />
                  </>
                )}
                <span className="relative z-10 flex items-center justify-center gap-3">
                  {generateKeyMutation.isPending ? (
                    <Loader2 className="animate-spin w-6 h-6" />
                  ) : !hasWatchedVideo ? (
                    <><Lock className="w-5 h-5" /> আগে ভিডিও দেখুন</>
                  ) : (
                    <><ShieldCheck className="w-6 h-6" /> ফেস ভেরিফিকেশন শুরু করুন</>
                  )}
                </span>
              </motion.button>

            </motion.div>
          )}

          {/* STEP: Name input (after clicking start button) */}
          {step === "name_input" && (
            <motion.div
              key="name_input"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              <div className="rounded-2xl border-2 border-[hsl(var(--amber))]/40 bg-gradient-to-br from-[hsl(var(--amber))]/10 to-[hsl(var(--orange))]/10 p-4 space-y-3">
                <label className="text-sm font-black text-[hsl(var(--amber))] flex items-center gap-2">
                  ⚡ যার মুখ দিয়ে ভেরিফাই করছেন, তার নাম লিখুন
                </label>
                <input
                  type="text"
                  autoFocus
                  value={faceLabel}
                  onChange={(e) => setFaceLabel(e.target.value.slice(0, 60))}
                  placeholder="যেমন: সামিউল, রহিম, করিম..."
                  className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border focus:border-[hsl(var(--amber))] outline-none text-sm font-bold text-foreground placeholder:text-muted-foreground/60 transition-colors"
                  maxLength={60}
                />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  📝 Re-verify করার সময় এই নাম দিয়ে আপনি ওয়ালেট সহজে খুঁজে পাবেন।
                </p>
              </div>

              <motion.button
                onClick={() => generateKeyMutation.mutate()}
                disabled={generateKeyMutation.isPending || faceLabel.trim().length < 2}
                whileTap={faceLabel.trim().length >= 2 ? { scale: 0.97 } : {}}
                className={`w-full py-4 rounded-2xl font-black text-base transition-all ${
                  faceLabel.trim().length < 2
                    ? "bg-secondary/60 text-muted-foreground cursor-not-allowed border border-border/50"
                    : "bg-gradient-to-r from-[hsl(var(--emerald))] to-[hsl(var(--cyan))] text-primary-foreground shadow-lg"
                }`}
              >
                <span className="flex items-center justify-center gap-2">
                  {generateKeyMutation.isPending ? (
                    <Loader2 className="animate-spin w-5 h-5" />
                  ) : faceLabel.trim().length < 2 ? (
                    <><Lock className="w-4 h-4" /> নাম লিখুন</>
                  ) : (
                    <><ShieldCheck className="w-5 h-5" /> এগিয়ে যান</>
                  )}
                </span>
              </motion.button>

              <button
                onClick={() => { setFaceLabel(""); setStep("idle"); }}
                className="w-full py-2 rounded-xl text-xs font-bold text-muted-foreground hover:bg-secondary/50 transition-all"
              >
                বাতিল করুন
              </button>
            </motion.div>
          )}

          {/* STEP 2: Photo capture FIRST (before verify link) */}
          {step === "photo_capture" && activeKey && (
            <motion.div
              key="photo"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="mb-3 bg-[hsl(var(--cyan))]/10 border border-[hsl(var(--cyan))]/30 rounded-xl p-3 flex items-center gap-2">
                <Camera className="w-5 h-5 text-[hsl(var(--cyan))] shrink-0" />
                <p className="text-xs font-bold text-[hsl(var(--cyan))]">📸 প্রথমে আপনার মুখের ছবি তুলুন। ডুপ্লিকেট চেক হবে।</p>
              </div>
              <FaceCapture
                onCapture={handlePhotoCapture}
                onCancel={handlePhotoCancelled}
                isUploading={isPhotoUploading}
              />
            </motion.div>
          )}

          {/* STEP 3: Verify link (after photo captured) */}
          {step === "verify_link" && activeKey && (
            <motion.div
              key="verify"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-5"
            >
              <div className="bg-gradient-to-br from-[hsl(var(--emerald))]/15 to-[hsl(var(--cyan))]/10 border border-[hsl(var(--emerald))]/30 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-[hsl(var(--emerald))]" />
                  <p className="text-sm font-black text-[hsl(var(--emerald))]">✅ ফটো সেভ হয়েছে!</p>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  এখন নিচের বাটনে ক্লিক করে GoodDollar ফেস ভেরিফিকেশন করুন। ভেরিফাই শেষে ফিরে আসলে অটো চেক হবে এবং কাউন্ট সাথে সাথে বাড়বে।
                </p>
                <motion.a
                  href={activeKey.verifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setVerifyOpened(true)}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-[hsl(var(--emerald))] to-[hsl(var(--cyan))] text-primary-foreground font-black py-4 rounded-2xl shadow-lg"
                >
                  <ExternalLink className="w-5 h-5" /> Face Verification খুলুন
                </motion.a>
              </div>

              <motion.button
                onClick={() => checkWhitelistAndBind(activeKey)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full relative py-4 rounded-2xl font-black text-sm overflow-hidden text-primary-foreground shadow-lg"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--emerald))] to-[hsl(var(--cyan))]" />
                <span className="relative z-10 flex items-center justify-center gap-2">
                  <ShieldCheck className="w-5 h-5" /> সাবমিট করুন
                </span>
              </motion.button>

              <button
                onClick={() => {
                  capturedPhotoRef.current = null;
                  resetUI();
                  setStatusMessage(null);
                }}
                className="w-full py-3 rounded-xl border border-border/60 text-sm font-bold text-muted-foreground hover:bg-secondary/50 transition-all flex items-center justify-center gap-2"
              >
                <XCircle className="w-4 h-4" /> বাতিল করুন
              </button>
            </motion.div>
          )}

          {/* STEP: Manual Submit (when auto-check fails) */}
          {step === "manual_submit" && activeKey && (
            <motion.div
              key="manual_submit"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              <div className="bg-[hsl(var(--amber))]/10 border border-[hsl(var(--amber))]/30 rounded-2xl p-5 text-center">
                <AlertCircle className="w-10 h-10 text-[hsl(var(--amber))] mx-auto mb-3" />
                <p className="text-sm font-black text-[hsl(var(--amber))] mb-2">⚠️ অটো চেকে পাওয়া যায়নি</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  আপনি যদি GoodDollar এ সফলভাবে ভেরিফাই করে থাকেন, তাহলে নিচের "ম্যানুয়াল সাবমিট" বাটনে ক্লিক করুন। ফটো ও ওয়ালেট সেভ হবে।
                </p>
              </div>

              <motion.button
                onClick={() => forceBindAndSubmit(activeKey)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="w-full relative py-4 rounded-2xl font-black text-sm overflow-hidden text-primary-foreground shadow-lg"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--emerald))] to-[hsl(var(--cyan))]" />
                <span className="relative z-10 flex items-center justify-center gap-2">
                  <ShieldCheck className="w-5 h-5" /> ম্যানুয়াল সাবমিট করুন
                </span>
              </motion.button>

              <button
                onClick={() => checkWhitelistAndBind(activeKey)}
                className="w-full py-3 rounded-xl border border-[hsl(var(--cyan))]/40 bg-[hsl(var(--cyan))]/10 text-sm font-bold text-[hsl(var(--cyan))] hover:bg-[hsl(var(--cyan))]/20 transition-all flex items-center justify-center gap-2"
              >
                <RefreshCcw className="w-4 h-4" /> আবার অটো চেক করুন
              </button>

              <button
                onClick={() => {
                  capturedPhotoRef.current = null;
                  saveNotWhitelistForAdmin(activeKey, "User বাতিল করেছে").catch(() => undefined);
                  resetUI();
                  setStatusMessage(null);
                }}
                className="w-full py-3 rounded-xl border border-border/60 text-sm font-bold text-muted-foreground hover:bg-secondary/50 transition-all flex items-center justify-center gap-2"
              >
                <XCircle className="w-4 h-4" /> বাতিল করুন
              </button>
            </motion.div>
          )}

          {step === "checking" && (
            <motion.div
              key="checking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-8 text-center space-y-4"
            >
              <Loader2 className="w-12 h-12 animate-spin text-[hsl(var(--cyan))] mx-auto" />
              <p className="text-sm font-black">হোয়াইটলিস্ট চেক ও বাইন্ড হচ্ছে...</p>
              <p className="text-[10px] text-muted-foreground">ব্লকচেইনে যাচাই চলছে, অপেক্ষা করুন</p>
            </motion.div>
          )}

          {step === "submitting" && (
            <motion.div
              key="submitting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-8 text-center space-y-4"
            >
              <Loader2 className="w-12 h-12 animate-spin text-[hsl(var(--emerald))] mx-auto" />
              <p className="text-sm font-black">ফটো ও ওয়ালেট সেভ হচ্ছে...</p>
              <p className="text-[10px] text-muted-foreground">কাউন্ট আপডেট হচ্ছে...</p>
            </motion.div>
          )}

          {(step === "done_success" || step === "done_failed") && statusMessage && (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`py-6 text-center rounded-2xl border ${
                step === "done_success" 
                  ? "bg-[hsl(var(--emerald))]/10 border-[hsl(var(--emerald))]/30" 
                  : "bg-destructive/10 border-destructive/30"
              }`}
            >
              {step === "done_success" ? (
                <CheckCircle className="w-12 h-12 text-[hsl(var(--emerald))] mx-auto mb-3" />
              ) : (
                <XCircle className="w-12 h-12 text-destructive mx-auto mb-3" />
              )}
              <p className={`text-sm font-black px-4 ${step === "done_success" ? "text-[hsl(var(--emerald))]" : "text-destructive"}`}>
                {statusMessage}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
