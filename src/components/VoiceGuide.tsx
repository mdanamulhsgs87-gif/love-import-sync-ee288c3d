import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Play } from "lucide-react";
import { motion } from "framer-motion";

const GUIDE_TEXT = `আসসালামু আলাইকুম। ফেস ভেরিফিকেশন কিভাবে করবেন, ধাপে ধাপে শুনুন।
ধাপ এক। নিচের রঙিন বড় বাটন, ফেস ভেরিফিকেশন শুরু করুন, এই বাটনে একবার ক্লিক করুন।
ধাপ দুই। ক্লিক করার পর আপনার মোবাইলের সামনের ক্যামেরা চালু হবে। ক্যামেরা পারমিশন চাইলে, Allow চাপুন।
ধাপ তিন। মুখ সোজা ক্যামেরার সামনে রাখুন। ভালো আলোতে থাকুন। চশমা বা মাস্ক খুলে রাখুন। অ্যাপ নিজেই আপনার মুখ দেখে অটোমেটিক ছবি তুলে নেবে।
ধাপ চার। ছবি তোলার পর কিছুক্ষণ অপেক্ষা করুন। সিস্টেম চেক করবে এই মুখ আগে অন্য কোথাও ব্যবহার হয়েছে কিনা।
ধাপ পাঁচ। চেক হয়ে গেলে, একটি নতুন সবুজ বাটন আসবে, Face Verification খুলুন। সেই বাটনে ক্লিক করুন। গুড ডলার ওয়েবসাইট খুলবে।
ধাপ ছয়। গুড ডলার সাইটে গিয়ে তাদের নিয়ম মেনে ফেস স্ক্যান সম্পন্ন করুন। ভেরিফাই শেষ হলে, ব্রাউজার বন্ধ করে আবার আমাদের অ্যাপে ফিরে আসুন।
ধাপ সাত। অ্যাপে ফিরে এসে সাবমিট করুন বাটনে ক্লিক করুন। হোয়াইটলিস্ট চেক হবে এবং সফল হলে আপনার ব্যালেন্সে টাকা যুক্ত হবে।
ধন্যবাদ। সফলভাবে ভেরিফাই করুন এবং উপার্জন করুন।`;

const STORAGE_KEY = "voice_guide_played_v1";

export function VoiceGuide() {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  const pickVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((v) => /bn[-_]?(BD|IN)?/i.test(v.lang) && /female|woman|মহিলা/i.test(v.name)) ||
      voices.find((v) => /bn[-_]?(BD|IN)?/i.test(v.lang)) ||
      voices.find((v) => /hi[-_]?IN/i.test(v.lang)) ||
      null
    );
  };

  const speak = () => {
    if (!("speechSynthesis" in window)) {
      setSupported(false);
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(GUIDE_TEXT);
    u.lang = "bn-BD";
    u.rate = 0.92;
    u.pitch = 1.05;
    const v = pickVoice();
    if (v) u.voice = v;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    utterRef.current = u;
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  };

  const stop = () => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  // Auto-play on first visit (after voices load)
  useEffect(() => {
    if (!("speechSynthesis" in window)) {
      setSupported(false);
      return;
    }
    if (localStorage.getItem(STORAGE_KEY)) return;

    const tryPlay = () => {
      localStorage.setItem(STORAGE_KEY, "1");
      // small delay so UI settles
      setTimeout(speak, 600);
    };

    if (window.speechSynthesis.getVoices().length > 0) {
      tryPlay();
    } else {
      const handler = () => {
        window.speechSynthesis.onvoiceschanged = null;
        tryPlay();
      };
      window.speechSynthesis.onvoiceschanged = handler;
      // fallback timer in case voiceschanged never fires
      setTimeout(() => {
        if (!localStorage.getItem(STORAGE_KEY)) tryPlay();
      }, 1500);
    }

    return () => {
      window.speechSynthesis.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!supported) return null;

  return (
    <motion.button
      onClick={speaking ? stop : speak}
      whileTap={{ scale: 0.97 }}
      className={`w-full relative overflow-hidden rounded-2xl p-4 border-2 transition-all ${
        speaking
          ? "border-[hsl(var(--pink))]/50 bg-gradient-to-r from-[hsl(var(--pink))]/15 to-[hsl(var(--purple))]/15"
          : "border-[hsl(var(--cyan))]/40 bg-gradient-to-r from-[hsl(var(--cyan))]/10 via-[hsl(var(--blue))]/10 to-[hsl(var(--purple))]/10 hover:from-[hsl(var(--cyan))]/15"
      }`}
    >
      {speaking && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent"
          animate={{ x: ["-100%", "200%"] }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        />
      )}
      <div className="relative z-10 flex items-center gap-3">
        <motion.div
          animate={speaking ? { scale: [1, 1.15, 1] } : {}}
          transition={{ duration: 0.8, repeat: Infinity }}
          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
            speaking
              ? "bg-gradient-to-br from-[hsl(var(--pink))] to-[hsl(var(--purple))]"
              : "bg-gradient-to-br from-[hsl(var(--cyan))] to-[hsl(var(--blue))]"
          }`}
        >
          {speaking ? (
            <VolumeX className="w-5 h-5 text-white" />
          ) : (
            <Volume2 className="w-5 h-5 text-white" />
          )}
        </motion.div>
        <div className="flex-1 text-left">
          <p className="text-sm font-black text-foreground flex items-center gap-1.5">
            {speaking ? "🔊 বলছি..." : "🎧 বাংলা ভয়েসে শুনুন"}
          </p>
          <p className="text-[11px] text-muted-foreground font-medium leading-tight mt-0.5">
            {speaking
              ? "থামাতে ট্যাপ করুন"
              : "ফেস ভেরিফাই কিভাবে করবেন — স্টেপ বাই স্টেপ"}
          </p>
        </div>
        {!speaking && (
          <div className="w-9 h-9 rounded-full bg-[hsl(var(--cyan))]/20 flex items-center justify-center shrink-0">
            <Play className="w-4 h-4 text-[hsl(var(--cyan))] fill-[hsl(var(--cyan))] ml-0.5" />
          </div>
        )}
      </div>
    </motion.button>
  );
}