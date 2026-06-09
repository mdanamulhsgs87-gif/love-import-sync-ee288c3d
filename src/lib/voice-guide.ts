// Step-by-step Bangla voice guide for face verification.
// Cheerful female voice using browser SpeechSynthesis.

type StepKey =
  | "idle"
  | "generating"
  | "photo_capture"
  | "verify_link"
  | "checking"
  | "submitting"
  | "manual_submit"
  | "done_success"
  | "done_failed";

const SCRIPTS: Record<StepKey, string> = {
  idle:
    "হ্যালো! ফেস ভেরিফাই করতে, নিচের রঙিন বড় বাটনে, ফেস ভেরিফিকেশন শুরু করুন, এই লেখাটার উপর একবার ক্লিক করুন!",
  generating: "একটু অপেক্ষা করুন, আপনার ভেরিফিকেশন কী তৈরি হচ্ছে।",
  photo_capture:
    "দারুণ! এবার ক্যামেরার দিকে সোজা তাকান। মুখ ভালো আলোতে রাখুন, ক্যামেরা নিজেই অটো ছবি তুলে নেবে!",
  verify_link:
    "বাহ! ছবি সেভ হয়ে গেছে! এখন সবুজ রঙের, ফেস ভেরিফিকেশন খুলুন, বাটনে ক্লিক করুন। গুড ডলার সাইটে গিয়ে ফেস স্ক্যান করুন। শেষ হলে আবার এই অ্যাপে ফিরে এসে, সাবমিট করুন বাটনে চাপুন!",
  checking: "অপেক্ষা করুন, হোয়াইটলিস্ট চেক হচ্ছে।",
  submitting: "প্রায় শেষ! ফটো আর ওয়ালেট সেভ হচ্ছে।",
  manual_submit:
    "চিন্তা নেই! যদি গুড ডলারে ভেরিফাই করে থাকেন, তাহলে ম্যানুয়াল সাবমিট বাটনে ক্লিক করুন।",
  done_success:
    "অভিনন্দন! আপনি সফলভাবে ভেরিফাই হয়েছেন, আর আপনার ব্যালেন্সে টাকা যোগ হয়েছে! দারুণ কাজ!",
  done_failed:
    "ইশ! এবার হয়নি। চিন্তা করবেন না, আবার চেষ্টা করুন, এবার নিশ্চয়ই হবে!",
};

let supported = typeof window !== "undefined" && "speechSynthesis" in window;
let voicesLoaded = false;
let chosenVoice: SpeechSynthesisVoice | null = null;
let listeners = new Set<(speaking: boolean) => void>();
let isSpeaking = false;

const FEMALE_HINTS = /female|woman|girl|মহিলা|nila|rashmi|priya|kalpana|heera|tina|raveena|isha|google/i;

function pickVoice(): SpeechSynthesisVoice | null {
  if (!supported) return null;
  const voices = window.speechSynthesis.getVoices();
  const bn = voices.filter((v) => /^bn/i.test(v.lang));
  return (
    bn.find((v) => FEMALE_HINTS.test(v.name)) ||
    bn[0] ||
    voices.find((v) => /^hi/i.test(v.lang) && FEMALE_HINTS.test(v.name)) ||
    voices.find((v) => /^hi/i.test(v.lang)) ||
    null
  );
}

function ensureVoices(cb: () => void) {
  if (!supported) return;
  if (window.speechSynthesis.getVoices().length > 0) {
    chosenVoice = pickVoice();
    voicesLoaded = true;
    cb();
    return;
  }
  const handler = () => {
    chosenVoice = pickVoice();
    voicesLoaded = true;
    window.speechSynthesis.onvoiceschanged = null;
    cb();
  };
  window.speechSynthesis.onvoiceschanged = handler;
  setTimeout(() => {
    if (!voicesLoaded) {
      chosenVoice = pickVoice();
      voicesLoaded = true;
      cb();
    }
  }, 1200);
}

function notify() {
  listeners.forEach((l) => l(isSpeaking));
}

export function onSpeakingChange(cb: (speaking: boolean) => void) {
  listeners.add(cb);
  cb(isSpeaking);
  return () => listeners.delete(cb);
}

export function stopSpeak() {
  if (!supported) return;
  window.speechSynthesis.cancel();
  isSpeaking = false;
  notify();
}

export function speakBangla(text: string) {
  if (!supported || !text) return;
  ensureVoices(() => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "bn-BD";
    // Cheerful, warm, slightly excited female tone
    u.rate = 0.98;
    u.pitch = 1.35;
    u.volume = 1;
    if (chosenVoice) u.voice = chosenVoice;
    u.onstart = () => {
      isSpeaking = true;
      notify();
    };
    u.onend = () => {
      isSpeaking = false;
      notify();
    };
    u.onerror = () => {
      isSpeaking = false;
      notify();
    };
    window.speechSynthesis.speak(u);
  });
}

// Deduplicate: same step won't repeat back-to-back
let lastStep: StepKey | null = null;
export function speakStep(step: StepKey, opts?: { force?: boolean }) {
  if (!opts?.force && step === lastStep) return;
  lastStep = step;
  const text = SCRIPTS[step];
  if (text) speakBangla(text);
}

export function resetVoiceGuide() {
  lastStep = null;
  stopSpeak();
}

export const VOICE_SCRIPTS = SCRIPTS;