import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Lock, Loader2, CheckCircle2, KeyRound } from "lucide-react";

const CHANGE_REQUEST_PW_KEY = "goodapp_change_request_pw";

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newRequestPassword, setNewRequestPassword] = useState("");
  const [confirmRequestPassword, setConfirmRequestPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [done, setDone] = useState(false);
  const [mode, setMode] = useState<"login" | "request">("login");
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check intent from localStorage
    const intent = localStorage.getItem(CHANGE_REQUEST_PW_KEY);
    if (intent === "true") {
      setMode("request");
    }

    let resolved = false;

    // Check if this is a recovery flow from email link
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("access_token")) {
      resolved = true;
      setIsRecovery(true);
    }

    // Listen for PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        resolved = true;
        setIsRecovery(true);
      }
    });

    // Also try getSession - if user has a valid session, allow password reset
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!resolved && session?.user) {
        resolved = true;
        setIsRecovery(true);
      }
      // Safety: if still not resolved after session check, stop loading after 3s
      if (!resolved) {
        setTimeout(() => {
          if (!resolved) setIsRecovery(true);
        }, 3000);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleResetLoginPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({ title: "পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "পাসওয়ার্ড মিলছে না", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setDone(true);
      localStorage.removeItem(CHANGE_REQUEST_PW_KEY);
      toast({ title: "✅ লগইন পাসওয়ার্ড পরিবর্তন হয়েছে!" });
      setTimeout(() => navigate("/dashboard"), 2000);
    } catch (err: any) {
      toast({ title: "ব্যর্থ", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetRequestPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newRequestPassword.length < 4) {
      toast({ title: "পাসওয়ার্ড কমপক্ষে ৪ অক্ষর হতে হবে", variant: "destructive" });
      return;
    }
    if (newRequestPassword !== confirmRequestPassword) {
      toast({ title: "পাসওয়ার্ড মিলছে না", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      // Get current authenticated user - try getUser first, fallback to getSession
      let authUser = (await supabase.auth.getUser()).data?.user;
      if (!authUser) {
        const { data: { session } } = await supabase.auth.getSession();
        authUser = session?.user ?? null;
      }
      if (!authUser) throw new Error("ইউজার পাওয়া যায়নি। অনুগ্রহ করে আবার Gmail লিংকে ক্লিক করুন।");

      // Find app user by auth_id
      const { data: appUser, error: fetchErr } = await (supabase
        .from("users")
        .select("id") as any)
        .eq("auth_id", authUser.id)
        .single();
      if (fetchErr || !appUser) throw new Error("অ্যাকাউন্ট পাওয়া যায়নি");

      // Update request password
      const { error } = await supabase
        .from("users")
        .update({ request_password: newRequestPassword.trim() } as any)
        .eq("id", appUser.id);
      if (error) throw error;

      setDone(true);
      localStorage.removeItem(CHANGE_REQUEST_PW_KEY);
      toast({ title: "✅ Request পাসওয়ার্ড পরিবর্তন হয়েছে!" });
      setTimeout(() => navigate("/profile"), 2000);
    } catch (err: any) {
      toast({ title: "ব্যর্থ", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isRecovery && !done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">লোড হচ্ছে...</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center space-y-4"
        >
          <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
          <h2 className="text-xl font-black">
            {mode === "request" ? "Request পাসওয়ার্ড পরিবর্তন হয়েছে!" : "লগইন পাসওয়ার্ড পরিবর্তন হয়েছে!"}
          </h2>
          <p className="text-muted-foreground text-sm">
            {mode === "request" ? "প্রোফাইলে নিয়ে যাওয়া হচ্ছে..." : "ড্যাশবোর্ডে নিয়ে যাওয়া হচ্ছে..."}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm glass-card rounded-3xl p-6 border border-border/30 space-y-5"
      >
        {/* Mode selector tabs */}
        <div className="flex gap-2 bg-secondary/30 rounded-2xl p-1">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
              mode === "login"
                ? "bg-primary text-primary-foreground shadow-lg"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            🔑 লগইন পাসওয়ার্ড
          </button>
          <button
            onClick={() => setMode("request")}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
              mode === "request"
                ? "bg-[hsl(var(--amber))] text-primary-foreground shadow-lg"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            🔒 Request পাসওয়ার্ড
          </button>
        </div>

        {mode === "login" ? (
          <>
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto">
                <Lock className="w-7 h-7 text-primary" />
              </div>
              <h1 className="text-xl font-black">নতুন লগইন পাসওয়ার্ড</h1>
              <p className="text-xs text-muted-foreground">আপনার নতুন লগইন পাসওয়ার্ড দিন</p>
            </div>
            <form onSubmit={handleResetLoginPassword} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 ml-1">নতুন পাসওয়ার্ড</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="কমপক্ষে ৬ অক্ষর..."
                  className="input-field text-base py-3"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 ml-1">পাসওয়ার্ড নিশ্চিত করুন</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="আবার পাসওয়ার্ড দিন..."
                  className="input-field text-base py-3"
                />
              </div>
              <motion.button
                type="submit"
                disabled={isSubmitting || newPassword.length < 6}
                className="w-full py-4 rounded-2xl font-black text-lg bg-gradient-to-r from-primary to-[hsl(var(--cyan))] text-primary-foreground"
                whileTap={{ scale: 0.95 }}
              >
                {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : "✅ লগইন পাসওয়ার্ড সেভ করুন"}
              </motion.button>
            </form>
          </>
        ) : (
          <>
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-[hsl(var(--amber))]/20 flex items-center justify-center mx-auto">
                <KeyRound className="w-7 h-7 text-[hsl(var(--amber))]" />
              </div>
              <h1 className="text-xl font-black">নতুন Request পাসওয়ার্ড</h1>
              <p className="text-xs text-muted-foreground">Gmail লিংক ভেরিফাই হয়েছে — নতুন পাসওয়ার্ড দিন</p>
            </div>
            <form onSubmit={handleResetRequestPassword} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 ml-1">নতুন Request পাসওয়ার্ড</label>
                <input
                  type="password"
                  value={newRequestPassword}
                  onChange={(e) => setNewRequestPassword(e.target.value)}
                  placeholder="কমপক্ষে ৪ অক্ষর..."
                  className="input-field text-base py-3"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 ml-1">পাসওয়ার্ড নিশ্চিত করুন</label>
                <input
                  type="password"
                  value={confirmRequestPassword}
                  onChange={(e) => setConfirmRequestPassword(e.target.value)}
                  placeholder="আবার পাসওয়ার্ড দিন..."
                  className="input-field text-base py-3"
                />
              </div>
              <div className="rounded-xl bg-[hsl(var(--amber))]/10 border border-[hsl(var(--amber))]/20 p-3">
                <p className="text-[11px] text-[hsl(var(--amber))] font-bold leading-relaxed">
                  ⚠️ এই পাসওয়ার্ড ভালো করে মনে রাখুন! পরিবর্তন করতে আবার Gmail ভেরিফিকেশন লাগবে।
                </p>
              </div>
              <motion.button
                type="submit"
                disabled={isSubmitting || newRequestPassword.length < 4}
                className="w-full py-4 rounded-2xl font-black text-lg bg-gradient-to-r from-[hsl(var(--amber))] to-[hsl(var(--orange))] text-primary-foreground"
                whileTap={{ scale: 0.95 }}
              >
                {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : "✅ Request পাসওয়ার্ড সেভ করুন"}
              </motion.button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
