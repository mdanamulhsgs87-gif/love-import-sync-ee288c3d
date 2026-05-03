import { Mail } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = (location.state as any)?.email || "";

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="glass-card p-10 rounded-3xl text-center space-y-6">
          <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto">
            <Mail className="w-10 h-10 text-primary" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold">ইমেইল ভেরিফাই করুন</h1>
            <p className="text-muted-foreground">
              আমরা <span className="text-foreground font-bold">{email}</span> এ একটি ভেরিফিকেশন লিংক পাঠিয়েছি।
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              আপনার Gmail/ইমেইল অ্যাপ খুলুন, verification link-এ tap করুন, তারপর অ্যাপে ফিরে লগইন করুন।
            </p>
            <p className="text-xs text-muted-foreground">
              প্রথমবার ভেরিফাই হয়ে ঢোকার পর request password setup করার অপশনও দেখানো হবে।
            </p>
          </div>

          <button onClick={() => navigate("/")} className="btn-primary py-4 text-lg">
            আমি verify করে এসেছি
          </button>
        </div>
      </motion.div>
    </div>
  );
}
