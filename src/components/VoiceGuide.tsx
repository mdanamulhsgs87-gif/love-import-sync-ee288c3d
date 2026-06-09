import { useEffect, useState } from "react";
import { Volume2, VolumeX, Play } from "lucide-react";
import { motion } from "framer-motion";
import { onSpeakingChange, speakStep, stopSpeak } from "@/lib/voice-guide";

const STORAGE_KEY = "voice_guide_played_v2";

export function VoiceGuide() {
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!supported) return;
    const off = onSpeakingChange(setSpeaking);
    return () => { off(); };
  }, [supported]);

  // Auto-play the idle (intro) step once per device
  useEffect(() => {
    if (!supported) return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    localStorage.setItem(STORAGE_KEY, "1");
    const t = setTimeout(() => speakStep("idle", { force: true }), 700);
    return () => clearTimeout(t);
  }, [supported]);

  if (!supported) return null;

  const handleClick = () => {
    if (speaking) stopSpeak();
    else speakStep("idle", { force: true });
  };

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