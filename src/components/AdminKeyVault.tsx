import { copyToClipboard as copyText } from "@/lib/clipboard";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Copy, Lock, Loader2, RefreshCcw, CheckCircle, XCircle, Eye, EyeOff, Key, Shield, X, ZoomIn, Pencil, Plus, Trash2, Upload, Download, Clock } from "lucide-react";
import { ethers } from "ethers";

const VAULT_PASSWORD = "Anamul*984516";
const GD_IDENTITY_ADDRESS = "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42";
const CELO_RPC = "https://forno.celo.org";
const GD_IDENTITY_ABI = ["function isWhitelisted(address account) view returns (bool)"];

type Tab = "verified" | "queue" | "failed_pool" | "generated" | "not_whitelist" | "reverified";

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
  const [editing, setEditing] = useState<any | null>(null); // binding being edited
  const [editLabel, setEditLabel] = useState("");
  const [editPrivateKey, setEditPrivateKey] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editingQueue, setEditingQueue] = useState<any | null>(null);
  const [queueEditLabel, setQueueEditLabel] = useState("");
  const [queueEditPrivateKey, setQueueEditPrivateKey] = useState("");
  const [queueEditUserId, setQueueEditUserId] = useState("");
  const [queueEditFile, setQueueEditFile] = useState<File | null>(null);
  const [savingQueueEdit, setSavingQueueEdit] = useState(false);
  const [editingPool, setEditingPool] = useState<any | null>(null);
  const [poolEditLabel, setPoolEditLabel] = useState("");
  const [poolEditPrivateKey, setPoolEditPrivateKey] = useState("");
  const [poolEditFile, setPoolEditFile] = useState<File | null>(null);
  const [savingPoolEdit, setSavingPoolEdit] = useState(false);
  const [poolAssignUserId, setPoolAssignUserId] = useState<Record<number, string>>({});
  const [showCustomAdd, setShowCustomAdd] = useState(false);
  const [customPK, setCustomPK] = useState("");
  const [customUserId, setCustomUserId] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [savingCustom, setSavingCustom] = useState(false);
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

  const { data: poolItems = [] } = useQuery({
    queryKey: ["admin-pool-vault"],
    queryFn: async () => {
      const result = await vaultCall("get_pool");
      return result.pool || [];
    },
    enabled: unlocked,
  });

  const completedReverify = reverifyQueue.filter((r: any) => r.status === "completed");
  const pendingReverify = reverifyQueue.filter((r: any) => r.status === "pending");
  const failedPoolItems = poolItems.filter((p: any) => p.status === "not_whitelist");
  const generatedPoolItems = poolItems.filter((p: any) => p.status !== "not_whitelist");
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

  // Upload a face image to the `face-photos` bucket and return the public URL
  const uploadFace = async (file: File): Promise<string> => {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `admin/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("face-photos").upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from("face-photos").getPublicUrl(path);
    return data.publicUrl;
  };

  const openEdit = (b: any) => {
    setEditing(b);
    setEditLabel(b.face_label || "");
    setEditPrivateKey(b.private_key || "");
    setEditFile(null);
  };

  const openQueueEdit = (q: any) => {
    setEditingQueue(q);
    setQueueEditLabel(q.face_label || q.binding?.face_label || "");
    setQueueEditPrivateKey(q.private_key || "");
    setQueueEditUserId(String(q.assigned_user_id || ""));
    setQueueEditFile(null);
  };

  const openPoolEdit = (p: any) => {
    setEditingPool(p);
    setPoolEditLabel(p.face_label || "");
    setPoolEditPrivateKey(p.private_key || "");
    setPoolEditFile(null);
  };

  const downloadFace = async (url: string, name = "face-photo.jpg") => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank");
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    try {
      let face_photo_url: string | undefined;
      if (editFile) face_photo_url = await uploadFace(editFile);
      await vaultCall("update_binding", {
        id: editing.id,
        face_label: editLabel,
        private_key: editPrivateKey.trim(),
        ...(face_photo_url ? { face_photo_url } : {}),
      });
      toast({ title: "✅ আপডেট হয়েছে" });
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["admin-face-bindings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-reverify-queue"] });
    } catch (e: any) {
      toast({ title: "❌ আপডেট ব্যর্থ", description: e.message, variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  const saveQueueEdit = async () => {
    if (!editingQueue) return;
    setSavingQueueEdit(true);
    try {
      let face_photo_url: string | undefined;
      if (queueEditFile) face_photo_url = await uploadFace(queueEditFile);
      await vaultCall("update_queue_item", {
        id: editingQueue.id,
        private_key: queueEditPrivateKey.trim(),
        face_label: queueEditLabel,
        assigned_user_id: parseInt(queueEditUserId, 10),
        ...(face_photo_url ? { face_photo_url } : {}),
      });
      toast({ title: "✅ Queue আপডেট হয়েছে" });
      setEditingQueue(null);
      queryClient.invalidateQueries({ queryKey: ["admin-reverify-queue"] });
      queryClient.invalidateQueries({ queryKey: ["admin-face-bindings"] });
    } catch (e: any) {
      toast({ title: "❌ Queue update ব্যর্থ", description: e.message, variant: "destructive" });
    } finally {
      setSavingQueueEdit(false);
    }
  };

  const savePoolEdit = async () => {
    if (!editingPool) return;
    setSavingPoolEdit(true);
    try {
      let face_photo_url: string | undefined;
      if (poolEditFile) face_photo_url = await uploadFace(poolEditFile);
      await vaultCall("update_pool_item", {
        id: editingPool.id,
        private_key: poolEditPrivateKey.trim(),
        face_label: poolEditLabel,
        status: editingPool.status || "not_whitelist",
        ...(face_photo_url ? { face_photo_url } : {}),
      });
      toast({ title: "✅ Failed key আপডেট হয়েছে" });
      setEditingPool(null);
      queryClient.invalidateQueries({ queryKey: ["admin-pool-vault"] });
    } catch (e: any) {
      toast({ title: "❌ আপডেট ব্যর্থ", description: e.message, variant: "destructive" });
    } finally {
      setSavingPoolEdit(false);
    }
  };

  const addPoolToQueue = async (p: any) => {
    try {
      const assigned = poolAssignUserId[p.id]?.trim();
      const result = await vaultCall("add_pool_to_queue", {
        pool_id: p.id,
        assigned_user_id: assigned ? parseInt(assigned, 10) : undefined,
      });
      toast({ title: "✅ Re-verify queue-তে যোগ হয়েছে", description: `User #${result.assigned_user_id}` });
      queryClient.invalidateQueries({ queryKey: ["admin-pool-vault"] });
      queryClient.invalidateQueries({ queryKey: ["admin-face-bindings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-reverify-queue"] });
    } catch (e: any) {
      toast({ title: "❌ Queue-তে যোগ ব্যর্থ", description: e.message, variant: "destructive" });
    }
  };

  const submitCustomAdd = async () => {
    if (!customPK.trim() || !customUserId.trim() || !customFile) {
      toast({ title: "সব ফিল্ড দিন (Private Key, User ID, Face Photo)", variant: "destructive" });
      return;
    }
    setSavingCustom(true);
    try {
      const face_photo_url = await uploadFace(customFile);
      const result = await vaultCall("add_custom_to_queue", {
        private_key: customPK.trim(),
        face_photo_url,
        assigned_user_id: parseInt(customUserId.trim(), 10),
        face_label: customLabel.trim(),
      });
      toast({ title: "✅ কিউতে যুক্ত হয়েছে", description: result.wallet_address?.slice(0, 18) + "..." });
      setCustomPK(""); setCustomUserId(""); setCustomLabel(""); setCustomFile(null);
      setShowCustomAdd(false);
      queryClient.invalidateQueries({ queryKey: ["admin-face-bindings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-reverify-queue"] });
    } catch (e: any) {
      toast({ title: "❌ যুক্ত করা ব্যর্থ", description: e.message, variant: "destructive" });
    } finally {
      setSavingCustom(false);
    }
  };

  const deleteBinding = async (b: any) => {
    if (!confirm(`এই binding ডিলিট করবেন?\n${b.wallet_address}`)) return;
    try {
      await vaultCall("delete_binding", { id: b.id });
      toast({ title: "✅ ডিলিট হয়েছে" });
      queryClient.invalidateQueries({ queryKey: ["admin-face-bindings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-reverify-queue"] });
    } catch (e: any) {
      toast({ title: "❌ ডিলিট ব্যর্থ", description: e.message, variant: "destructive" });
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
    { key: "queue", label: "🔁 Re-verify Queue", count: pendingReverify.length, color: "blue" },
    { key: "failed_pool", label: "🛟 Failed Saved", count: failedPoolItems.length, color: "amber" },
    { key: "generated", label: "🕒 Generated", count: generatedPoolItems.length, color: "purple" },
    { key: "not_whitelist", label: "⚠️ Live Check", count: notWhitelistedKeys.length, color: "amber" },
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
            <p className="text-[10px] text-muted-foreground">মোট {verifiedBindings.length} টি ভেরিফাইড কী</p>
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
                        <p className="text-[10px] font-mono truncate">
                          {b.face_label ? <span className="font-sans font-bold text-[hsl(var(--primary))]">{b.face_label} · </span> : null}
                          {b.private_key.slice(0, 18)}...{b.private_key.slice(-6)}
                        </p>
                        <p className="text-[9px] text-muted-foreground">User #{b.user_id} | {b.wallet_address.slice(0, 10)}...</p>
                      </div>
                      <button
                        onClick={() => openEdit(b)}
                        className="p-1.5 bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] rounded-lg shrink-0"
                        title="Edit face/name"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => {
                          copyText(b.private_key);
                          toast({ title: `কী #${idx + 1} কপি হয়েছে` });
                        }}
                        className="p-1.5 bg-[hsl(var(--emerald))]/10 text-[hsl(var(--emerald))] rounded-lg shrink-0"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => deleteBinding(b)}
                        className="p-1.5 bg-destructive/10 text-destructive rounded-lg shrink-0"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
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
            {/* Custom add to re-verify queue */}
            <div className="bg-[hsl(var(--primary))]/5 border border-[hsl(var(--primary))]/20 rounded-xl p-3">
              <button
                onClick={() => setShowCustomAdd((v) => !v)}
                className="w-full flex items-center justify-between text-xs font-bold text-[hsl(var(--primary))]"
              >
                <span className="flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Custom কী + Face যোগ করুন (Re-verify Queue)</span>
                <span>{showCustomAdd ? "−" : "+"}</span>
              </button>
              {showCustomAdd && (
                <div className="mt-3 space-y-2">
                  <input
                    type="text"
                    placeholder="Private Key (0x...)"
                    value={customPK}
                    onChange={(e) => setCustomPK(e.target.value)}
                    className="w-full bg-background/80 border border-border rounded-lg px-3 py-2 text-[11px] font-mono"
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="User ID (যেমন 123)"
                      value={customUserId}
                      onChange={(e) => setCustomUserId(e.target.value)}
                      className="w-1/3 bg-background/80 border border-border rounded-lg px-3 py-2 text-[11px]"
                    />
                    <input
                      type="text"
                      placeholder="Name / Label (Nazmul)"
                      value={customLabel}
                      onChange={(e) => setCustomLabel(e.target.value)}
                      className="flex-1 bg-background/80 border border-border rounded-lg px-3 py-2 text-[11px]"
                    />
                  </div>
                  <label className="flex items-center gap-2 p-2 border border-dashed border-border rounded-lg cursor-pointer text-[11px]">
                    <Upload className="w-3.5 h-3.5" />
                    {customFile ? customFile.name : "Face photo বেছে নিন"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setCustomFile(e.target.files?.[0] || null)}
                    />
                  </label>
                  {customFile && (
                    <img src={URL.createObjectURL(customFile)} alt="" className="w-20 h-20 rounded-lg object-cover border border-border" />
                  )}
                  <button
                    onClick={submitCustomAdd}
                    disabled={savingCustom}
                    className="w-full px-3 py-2 bg-[hsl(var(--primary))] text-white text-xs font-bold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {savingCustom ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Queue-এ যোগ করুন
                  </button>
                </div>
              )}
            </div>

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

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => !savingEdit && setEditing(null)}>
          <div className="bg-card border border-border rounded-2xl p-4 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">Binding এডিট করুন</h3>
              <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-[10px] font-mono text-muted-foreground break-all">{editing.wallet_address}</p>

            <div className="flex items-center gap-3">
              <img
                src={editFile ? URL.createObjectURL(editFile) : editing.face_photo_url}
                alt=""
                className="w-20 h-20 rounded-xl object-cover border border-border"
              />
              <label className="flex-1 flex items-center gap-2 p-2 border border-dashed border-border rounded-lg cursor-pointer text-[11px]">
                <Upload className="w-3.5 h-3.5" />
                নতুন Face বেছে নিন
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setEditFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>

            <div>
              <label className="text-[11px] font-bold text-muted-foreground">Name / Label</label>
              <input
                type="text"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                placeholder="যেমন: Nazmul"
                className="w-full mt-1 bg-background/80 border border-border rounded-lg px-3 py-2 text-xs"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setEditing(null)}
                disabled={savingEdit}
                className="flex-1 px-3 py-2 bg-muted text-xs font-bold rounded-lg"
              >
                বাতিল
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="flex-1 px-3 py-2 bg-[hsl(var(--primary))] text-white text-xs font-bold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                সেভ করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
