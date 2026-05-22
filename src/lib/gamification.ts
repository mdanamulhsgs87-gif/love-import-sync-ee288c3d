import type { User } from "@/lib/api";

export type Level = {
  key: string;
  name: string;
  nameBn: string;
  emoji: string;
  min: number;
  max: number; // exclusive; Infinity for top
  color: string; // hsl token name
  gradient: string; // tailwind gradient classes
};

export const LEVELS: Level[] = [
  { key: "bronze",   name: "Bronze",   nameBn: "ব্রোঞ্জ",   emoji: "🥉", min: 0,   max: 10,       color: "amber",   gradient: "from-[hsl(var(--amber))]/30 to-[hsl(var(--orange))]/20" },
  { key: "silver",   name: "Silver",   nameBn: "সিলভার",   emoji: "🥈", min: 10,  max: 30,       color: "slate",   gradient: "from-slate-400/30 to-slate-200/20" },
  { key: "gold",     name: "Gold",     nameBn: "গোল্ড",     emoji: "🥇", min: 30,  max: 100,      color: "amber",   gradient: "from-[hsl(var(--amber))]/40 to-yellow-300/20" },
  { key: "platinum", name: "Platinum", nameBn: "প্লাটিনাম", emoji: "💠", min: 100, max: 300,      color: "cyan",    gradient: "from-[hsl(var(--cyan))]/35 to-blue-300/20" },
  { key: "diamond",  name: "Diamond",  nameBn: "ডায়মন্ড",   emoji: "💎", min: 300, max: Infinity, color: "violet",  gradient: "from-violet-500/35 to-fuchsia-400/25" },
];

export function getLevel(reverifyCount: number): { current: Level; next: Level | null; progress: number; toNext: number } {
  const n = Math.max(0, reverifyCount | 0);
  const idx = LEVELS.findIndex((l) => n >= l.min && n < l.max);
  const current = LEVELS[idx];
  const next = idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
  if (!next) return { current, next: null, progress: 100, toNext: 0 };
  const span = next.min - current.min;
  const done = n - current.min;
  const progress = Math.min(100, Math.max(0, (done / span) * 100));
  return { current, next, progress, toNext: Math.max(0, next.min - n) };
}

export type Achievement = {
  key: string;
  title: string;
  desc: string;
  emoji: string;
  earned: boolean;
};

export function getAchievements(user: Pick<User, "reverify_count" | "referral_usdt_earnings" | "promo_owner_usdt_earnings"> | null | undefined): Achievement[] {
  const rv = Number(user?.reverify_count || 0);
  const ref = Number(user?.referral_usdt_earnings || 0);
  const promo = Number(user?.promo_owner_usdt_earnings || 0);
  return [
    { key: "first",     title: "প্রথম Verify",       desc: "প্রথমবার Verify সম্পন্ন",  emoji: "✅", earned: rv >= 1 },
    { key: "ten",       title: "১০ Account ক্লাব",   desc: "১০টি Account Re-verify",  emoji: "🔥", earned: rv >= 10 },
    { key: "fifty",     title: "৫০ Account মাস্টার", desc: "৫০টি Account Re-verify",   emoji: "⚡", earned: rv >= 50 },
    { key: "hundred",   title: "১০০ Century",        desc: "১০০টি Account Re-verify",  emoji: "🏆", earned: rv >= 100 },
    { key: "twofifty",  title: "২৫০ Legend",         desc: "২৫০টি Account Re-verify",  emoji: "👑", earned: rv >= 250 },
    { key: "fivehundred", title: "৫০০ Elite",        desc: "৫০০টি Account Re-verify",  emoji: "💎", earned: rv >= 500 },
    { key: "refer",     title: "প্রথম Refer",         desc: "প্রথম Refer থেকে আয়",     emoji: "🤝", earned: ref > 0 },
    { key: "promo",     title: "Promo Star",          desc: "Promo Code থেকে আয়",      emoji: "🎬", earned: promo > 0 },
  ];
}