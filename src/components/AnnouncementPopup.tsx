import { useState, useEffect } from "react";
import { X, Megaphone, Smartphone, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ANNOUNCEMENT_VERSION = "2026-04-14-v1";
const STORAGE_KEY = "announcement_dismissed";

export function AnnouncementPopup() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed !== ANNOUNCEMENT_VERSION) {
      setShow(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, ANNOUNCEMENT_VERSION);
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={handleDismiss}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 40 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-primary/30 bg-card shadow-2xl shadow-primary/10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-muted/80 hover:bg-destructive/20 transition-colors"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>

            {/* Header */}
            <div className="bg-gradient-to-r from-primary/20 to-primary/5 px-5 pt-5 pb-4 rounded-t-2xl">
              <div className="flex items-center gap-2 mb-1">
                <Megaphone className="w-6 h-6 text-primary" />
                <h2 className="text-lg font-bold text-foreground">📢 গুরুত্বপূর্ণ ঘোষণা</h2>
              </div>
              <p className="text-xs text-muted-foreground">আসসালামু আলাইকুম</p>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4 text-sm text-foreground/90 leading-relaxed">
              {/* Re-verify notice */}
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                <p className="font-semibold text-destructive mb-1">😔 দুঃখের সাথে জানানো যাচ্ছে:</p>
                <p>আমাদের কেনা সব অ্যাকাউন্টে আবার ভেরিফিকেশন চাওয়া হচ্ছে। যে ফেস দিয়ে আগে ভেরিফাই করা হয়েছিল, একই ফেস দিয়ে আবার রি-ভেরিফাই করতে হবে।</p>
                <p className="mt-2 text-xs text-muted-foreground">❗ আগে কোনো সিস্টেম ছিল না, তাই কোন অ্যাকাউন্ট কোন ফেস দিয়ে করা হয়েছিল তা এখন বোঝা সম্ভব না।</p>
              </div>

              {/* New rules */}
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                <p className="font-semibold text-primary mb-2">🆕 নতুন নিয়ম (আজ থেকে):</p>
                <ul className="space-y-1.5 text-xs">
                  <li>📌 এখন থেকে যেসব অ্যাকাউন্ট ভেরিফিকেশন হবে, সেগুলো ১৪–২০ দিন পর রি-ভেরিফিকেশন চাইতে পারে।</li>
                  <li>📱 তখন অ্যাপের <strong>"Re-Verify"</strong> অপশনে গিয়ে একই ফেস দিয়ে আবার ভেরিফাই করতে হবে।</li>
                </ul>
              </div>

              {/* Warning */}
              <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                <p className="font-semibold text-yellow-600 dark:text-yellow-400 mb-1">⚠️ গুরুত্বপূর্ণ:</p>
                <ul className="space-y-1 text-xs">
                  <li>❌ আগের অ্যাকাউন্টগুলো এখন রি-ভেরিফাই করা যাবে না।</li>
                  <li>✅ শুধু নতুন অ্যাকাউন্টগুলোই রি-ভেরিফাই করা যাবে।</li>
                  <li>📅 যেদিন রি-ভেরিফিকেশন লাগবে, সেদিন জানিয়ে দেওয়া হবে।</li>
                </ul>
              </div>

              {/* New feature: Recharge */}
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Smartphone className="w-4 h-4 text-emerald-500" />
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400">🚀 নতুন ফিচার: মোবাইল রিচার্জ</p>
                </div>
                <ul className="space-y-1 text-xs">
                  <li>📲 অ্যাপ থেকেই মোবাইল রিচার্জ নিতে পারবেন</li>
                  <li>👤 ১টা অ্যাকাউন্ট থাকলেই রিচার্জ করা যাবে</li>
                  <li>🚫 কোনো অ্যাডমিন লাগবে না</li>
                  <li>⚡ নাম্বার + অ্যামাউন্ট দিলেই সাথে সাথে রিচার্জ</li>
                </ul>
              </div>

              {/* Rates */}
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <p className="font-semibold text-blue-600 dark:text-blue-400 mb-2">💰 নতুন রেট:</p>
                <ul className="space-y-1 text-xs">
                  <li>🟢 ১ম ভেরিফিকেশন: ২০–২৫ টাকা</li>
                  <li>🔁 রি-ভেরিফিকেশন: ২০–২৫ টাকা</li>
                </ul>
              </div>

              {/* Admin commission */}
              <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                <p className="font-semibold text-purple-600 dark:text-purple-400 mb-2">👨‍💼 অ্যাডমিন কমিশন:</p>
                <ul className="space-y-1 text-xs">
                  <li>💸 শুধু ১ম ভেরিফিকেশনে অ্যাডমিন কমিশন দেওয়া হবে</li>
                  <li>📤 রি-ভেরিফিকেশনে ইউজার সরাসরি bKash/Nagad-এ টাকা নিতে পারবে</li>
                  <li>🔒 ১ম বার যে অ্যাডমিন সিলেক্ট করবেন, সবসময় তার মাধ্যমেই পেমেন্ট</li>
                  <li>❌ অ্যাডমিন পরিবর্তন করা যাবে না</li>
                  <li>💵 প্রতি অ্যাকাউন্টে অ্যাডমিন কমিশন: ১০ টাকা</li>
                </ul>
              </div>

              <p className="text-center text-xs text-primary font-medium">
                🏆 যে অ্যাডমিন বেশি ইউজার ও অ্যাকাউন্ট করতে পারবে, তার জন্য থাকবে এক্সট্রা বোনাস 🎁
              </p>

              {/* How verification works */}
              <div className="p-3 rounded-xl bg-muted/50 border border-border">
                <p className="font-semibold text-foreground mb-2">📋 নতুন সিস্টেমে ভেরিফিকেশন কিভাবে করবেন:</p>
                <ol className="space-y-2 text-xs list-decimal list-inside">
                  <li>অ্যাপে লগইন করুন এবং ড্যাশবোর্ডে যান</li>
                  <li><strong>"ফেস ভেরিফিকেশন শুরু করুন"</strong> বাটনে ক্লিক করুন — স্বয়ংক্রিয়ভাবে ভেরিফিকেশন লিঙ্ক তৈরি হবে</li>
                  <li>লিঙ্কে গিয়ে আপনার ফেস দিয়ে ভেরিফাই করুন</li>
                  <li>ভেরিফিকেশন সফল হলে অ্যাপে <strong>Verified Count</strong> বাড়বে</li>
                  <li className="text-primary font-medium">১৪–২০ দিন পর রি-ভেরিফিকেশন লাগলে অ্যাপের <strong>"Re-Verify"</strong> সেকশনে গিয়ে একই ফেস দিয়ে আবার ভেরিফাই করুন</li>
                  <li>রি-ভেরিফিকেশন সফল হলে সরাসরি TK ব্যালেন্স পাবেন যা bKash/Nagad-এ উইথড্র করতে পারবেন</li>
                </ol>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 pt-2">
              <button
                onClick={handleDismiss}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
              >
                বুঝেছি, চালিয়ে যান <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
