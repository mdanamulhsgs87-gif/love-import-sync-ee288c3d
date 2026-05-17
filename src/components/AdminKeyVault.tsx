import { copyToClipboard as copyText } from "@/lib/clipboard";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Copy, Lock, Loader2, RefreshCcw, CheckCircle, XCircle, Eye, EyeOff, Key, Shield, X, ZoomIn } from "lucide-react";
import { ethers } from "ethers";

const VAULT_PASSWORD = "Anamul*984516";
const GD_IDENTITY_ADDRESS = "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42";
const CELO_RPC = "https://forno.celo.org";
const GD_IDENTITY_ABI = ["function isWhitelisted(address account) view returns (bool)"];

type Tab = "verified" | "not_whitelist" | "reverified";

// Helper to call admin-vault edge function
async function vaultCall(action: string, data?: any) {
  const { data: result, error } = await supabase.functions.invoke("admin-vault", {
    body: { password: VAULT_PASSWORD, action, data },
  });
  if (error) throw error;
  if (result?.error) throw new Error(result.error);
  return result;
}

export function AdminKeyVault() {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("verified");
  const [checking, setChecking] = useState(false);
  const [checkProgress, setCheckProgress] = useState({ done: 0, total: 0 });
  const [notWhitelistedKeys, setNotWhitelistedKeys] = useState<any[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: faceBindings = [] } = useQuery({
    queryKey: ["admin-face-bindings"],
    queryFn: async () => {
      const result = await vaultCall("get_bindings");
      return result.bindings || [];
    },
    enabled: unlocked,
  });

  const { data: reverifyQueue = [] } = useQuery({
    queryKey: ["admin-reverify-queue"],
    queryFn: async () => {
      const result = await vaultCall("get_reverify_queue");
      return result.queue || [];
    },
    enabled: unlocked,
  });

  const completedReverify = reverifyQueue.filter((r: any) => r.status === "completed");
  const pendingReverifyAddrs = new Set(
    reverifyQueue.filter((r: any) => r.status === "pending").map((r: any) => r.wallet_address)
  );
  const notWLAddrs = new Set([
    ...pendingReverifyAddrs,
    ...notWhitelistedKeys.map((b: any) => b.wallet_address),
  ]);
  const verifiedBindings = faceBindings.filter(
    (b: any) => !notWLAddrs.has(b.wallet_address)
  );

  const handleUnlock = () => {
    if (password === VAULT_PASSWORD) {
      setUnlocked(true);
    } else {
      toast({ title: "❌ পাসওয়ার্ড ভুল", variant: "destructive" });
    }
  };

  const checkAllWhitelist = async () => {
    if (faceBindings.length === 0) return;
    setChecking(true);
    setCheckProgress({ done: 0, total: faceBindings.length });
    const notWL: any[] = [];

    try {
      const provider = new ethers.JsonRpcProvider(CELO_RPC);
      const contract = new ethers.Contract(GD_IDENTITY_ADDRESS, GD_IDENTITY_ABI, provider);

      // Get queue status via edge function
      const queueResult = await vaultCall("get_queue_status");
      const existingQueue = queueResult.queue || [];
      const pendingAddresses = new Set(existingQueue.filter((e: any) => e.status === "pending").map((e: any) => e.wallet_address));
      const completedAddresses = new Set(existingQueue.filter((e: any) => e.status === "completed").map((e: any) => e.wallet_address));

      for (let i = 0; i < faceBindings.length; i++) {
        const b = faceBindings[i];
        try {
          const isWL = await contract.isWhitelisted(b.wallet_address);
          if (!isWL) {
            notWL.push(b);
            if (!pendingAddresses.has(b.wallet_address) && !completedAddresses.has(b.wallet_address)) {
              try {
                await vaultCall("add_to_queue", { binding: b });
              } catch (e) {
                // Already in queue
              }
            }
          }
        } catch (e) {
          console.error("Check failed for", b.wallet_address, e);
        }
        setCheckProgress({ done: i + 1, total: faceBindings.length });
      }

      setNotWhitelistedKeys(notWL);
      queryClient.invalidateQueries({ queryKey: ["admin-reverify-queue"] });
      toast({
        title: `চেক সম্পন্ন`,
        description: `${notWL.length} টি Not Whitelist পাওয়া গেছে`,
      });
    } catch (err: any) {
      toast({ title: "চেক ব্যর্থ", description: err.message, variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  // Password gate
  if (!unlocked) {
    return (
      <div className="glass-card rounded-2xl border-2 border-[hsl(var(--primary))]/20 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-[hsl(var(--primary))]/10">
            <Lock className="w-5 h-5 text-[hsl(var(--primary))]" />
          </div>
          <h2 className="text-lg font-bold">🔐 Key Vault</h2>
        </div>
        <div className="flex gap-2">
          <input
            type="password"
            placeholder="পাসওয়ার্ড দিন..."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
            className="flex-1 bg-background/80 border border-border rounded-lg px-3 py-2 text-sm"
          />
          <button onClick={handleUnlock} className="btn-primary px-4 py-2 text-sm">
            Open
          </button>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count: number; color: string }[] = [
            { key: "verified", label: "✅ Verified Keys", count: verifiedBindings.length, color: "emerald" },
    { key: "not_whitelist", label: "⚠️ Not Whitelist", count: notWhitelistedKeys.length, color: "amber" },
    { key: "reverified", label: "🔄 Re-verified", count: completedReverify.length, color: "cyan" },
  ];

  return (
    <div className="glass-card rounded-2xl border-2 border-[hsl(var(--primary))]/20 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[hsl(var(--primary))]/10">
            <Key className="w-5 h-5 text-[hsl(var(--primary))]" />
          </div>
          <div>
            <h2 className="text-lg font-bold">🔐 Key Vault</h2>
            <p className="text-[10px] text-muted-foreground">মোট {faceBindings.length} টি ভেরিফাইড কী</p>
          </div>
        </div>
        <button
          onClick={checkAllWhitelist}
          disabled={checking || faceBindings.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 bg-[hsl(var(--amber))]/20 text-[hsl(var(--amber))] text-xs font-bold rounded-lg disabled:opacity-50"
        >
          {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
          {checking ? `${checkProgress.done}/${checkProgress.total}` : "Whitelist চেক"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/50">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 text-xs font-bold text-center transition-colors relative ${
              activeTab === tab.key
                ? `text-[hsl(var(--${tab.color}))] border-b-2 border-[hsl(var(--${tab.color}))]`
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] bg-[hsl(var(--${tab.color}))]/20`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {/* ═══ Verified Keys Tab ═══ */}
        {activeTab === "verified" && (
          <div className="space-y-3">
            {verifiedBindings.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const allKeys = verifiedBindings.map((b: any) => b.private_key).join("\n");
                    copyText(allKeys);
                    toast({ title: `${verifiedBindings.length} টি কী কপি হয়েছে` });
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-[hsl(var(--emerald))]/20 text-[hsl(var(--emerald))] text-xs font-bold rounded-xl"
                >
                  <Copy className="w-4 h-4" /> সব কী কপি করুন ({verifiedBindings.length})
                </button>
              </div>
            )}

            {verifiedBindings.length > 0 ? (
              <div className="bg-secondary/60 rounded-xl p-3 border border-border/50">
                <textarea
                  readOnly
                  value={verifiedBindings.map((b: any) => b.private_key).join("\n")}
                  className="w-full bg-background/80 border border-border rounded-lg px-3 py-2 text-[10px] font-mono h-40 resize-none"
                />
                <div className="mt-2 max-h-60 overflow-y-auto space-y-1.5">
                  {verifiedBindings.map((b: any, idx: number) => (
                    <div key={b.id} className="flex items-center gap-2 p-2 bg-background/60 rounded-lg">
                      <img src={b.face_photo_url} alt="" className="w-8 h-8 rounded-lg object-cover border border-border cursor-pointer hover:ring-2 hover:ring-[hsl(var(--primary))]" onClick={() => setLightboxUrl(b.face_photo_url)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-mono truncate">{b.private_key.slice(0, 18)}...{b.private_key.slice(-6)}</p>
                        <p className="text-[9px] text-muted-foreground">User #{b.user_id} | {b.wallet_address.slice(0, 10)}...</p>
                      </div>
                      <button
                        onClick={() => {
                          copyText(b.private_key);
                          toast({ title: `কী #${idx + 1} কপি হয়েছে` });
                        }}
                        className="p-1.5 bg-[hsl(var(--emerald))]/10 text-[hsl(var(--emerald))] rounded-lg shrink-0"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-6">কোনো ভেরিফাইড কী নেই</p>
            )}
          </div>
        )}

        {/* ═══ Not Whitelist Tab ═══ */}
        {activeTab === "not_whitelist" && (
          <div className="space-y-3">
            {!checking && notWhitelistedKeys.length === 0 && (
              <div className="text-center py-6">
                <p className="text-xs text-muted-foreground mb-3">
                  প্রথমে "Whitelist চেক" বাটনে ক্লিক করুন
                </p>
                <button
                  onClick={checkAllWhitelist}
                  disabled={checking || faceBindings.length === 0}
                  className="px-4 py-2 bg-[hsl(var(--amber))]/20 text-[hsl(var(--amber))] text-xs font-bold rounded-xl"
                >
                  <Shield className="w-4 h-4 inline mr-1" /> এখন চেক করুন
                </button>
              </div>
            )}

            {checking && (
              <div className="text-center py-6">
                <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--amber))] mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  চেক হচ্ছে... {checkProgress.done}/{checkProgress.total}
                </p>
                <div className="w-full bg-secondary rounded-full h-2 mt-2">
                  <div
                    className="bg-[hsl(var(--amber))] h-2 rounded-full transition-all"
                    style={{ width: `${checkProgress.total > 0 ? (checkProgress.done / checkProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {notWhitelistedKeys.length > 0 && (
              <>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const allKeys = notWhitelistedKeys.map((b: any) => b.private_key).join("\n");
                      copyText(allKeys);
                      toast({ title: `${notWhitelistedKeys.length} টি Not Whitelist কী কপি হয়েছে` });
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-[hsl(var(--amber))]/20 text-[hsl(var(--amber))] text-xs font-bold rounded-xl"
                  >
                    <Copy className="w-4 h-4" /> সব Not WL কী কপি ({notWhitelistedKeys.length})
                  </button>
                </div>

                <div className="bg-[hsl(var(--amber))]/5 rounded-xl p-2 border border-[hsl(var(--amber))]/20">
                  <p className="text-[10px] text-[hsl(var(--amber))] mb-2 font-bold">
                    ⚠️ এই কী গুলো Not Whitelisted — ইউজারদের কাছে রি-ভেরিফাই এর জন্য পাঠানো হয়েছে
                  </p>
                </div>

                <textarea
                  readOnly
                  value={notWhitelistedKeys.map((b: any) => b.private_key).join("\n")}
                  className="w-full bg-background/80 border border-[hsl(var(--amber))]/30 rounded-lg px-3 py-2 text-[10px] font-mono h-32 resize-none"
                />

                <div className="max-h-60 overflow-y-auto space-y-1.5">
                  {notWhitelistedKeys.map((b: any, idx: number) => (
                    <div key={b.id} className="flex items-center gap-2 p-2 bg-[hsl(var(--amber))]/5 rounded-lg border border-[hsl(var(--amber))]/10">
                      <img src={b.face_photo_url} alt="" className="w-8 h-8 rounded-lg object-cover border border-border cursor-pointer hover:ring-2 hover:ring-[hsl(var(--primary))]" onClick={() => setLightboxUrl(b.face_photo_url)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-mono truncate">{b.private_key.slice(0, 18)}...{b.private_key.slice(-6)}</p>
                        <p className="text-[9px] text-muted-foreground">User #{b.user_id} → রি-ভেরিফাই কিউতে</p>
                      </div>
                      <XCircle className="w-4 h-4 text-[hsl(var(--amber))] shrink-0" />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ Re-verified Tab ═══ */}
        {activeTab === "reverified" && (
          <div className="space-y-3">
            {completedReverify.length > 0 ? (
              <>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const allKeys = completedReverify.map((r: any) => r.private_key).join("\n");
                      copyText(allKeys);
                      toast({ title: `${completedReverify.length} টি রি-ভেরিফাইড কী কপি হয়েছে` });
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-[hsl(var(--cyan))]/20 text-[hsl(var(--cyan))] text-xs font-bold rounded-xl"
                  >
                    <Copy className="w-4 h-4" /> সব Re-verified কী কপি ({completedReverify.length})
                  </button>
                </div>

                <textarea
                  readOnly
                  value={completedReverify.map((r: any) => r.private_key).join("\n")}
                  className="w-full bg-background/80 border border-[hsl(var(--cyan))]/30 rounded-lg px-3 py-2 text-[10px] font-mono h-32 resize-none"
                />

                <div className="max-h-60 overflow-y-auto space-y-1.5">
                  {completedReverify.map((r: any) => (
                    <div key={r.id} className="flex items-center gap-2 p-2 bg-[hsl(var(--cyan))]/5 rounded-lg border border-[hsl(var(--cyan))]/10">
                      <img src={r.face_photo_url} alt="" className="w-8 h-8 rounded-lg object-cover border border-border cursor-pointer hover:ring-2 hover:ring-[hsl(var(--primary))]" onClick={() => setLightboxUrl(r.face_photo_url)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-mono truncate">{r.private_key.slice(0, 18)}...{r.private_key.slice(-6)}</p>
                        <p className="text-[9px] text-muted-foreground">
                          User #{r.assigned_user_id} | {r.completed_at ? new Date(r.completed_at).toLocaleDateString("bn-BD") : ""}
                        </p>
                      </div>
                      <CheckCircle className="w-4 h-4 text-[hsl(var(--cyan))] shrink-0" />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-6">কোনো রি-ভেরিফাইড কী নেই</p>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
          <button onClick={() => setLightboxUrl(null)} className="absolute top-4 right-4 p-2 bg-white/20 rounded-full text-white hover:bg-white/40 transition-colors">
            <X className="w-6 h-6" />
          </button>
          <img src={lightboxUrl} alt="Face Photo" className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
