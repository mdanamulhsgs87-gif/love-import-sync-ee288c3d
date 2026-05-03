import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Copy, Trash2, ToggleLeft, ToggleRight, Plus, Key, Eye, EyeOff, Settings } from "lucide-react";

const ALL_FEATURES = [
  { name: "face-verify", label: "ফেস ভেরিফাই", desc: "ফেস ক্যাপচার দিয়ে ওয়ালেট ভেরিফিকেশন" },
  { name: "face-capture", label: "ফেস ক্যাপচার", desc: "ক্যামেরা দিয়ে ফেস ছবি তোলা" },
  { name: "re-verify", label: "রি-ভেরিফাই", desc: "ওয়ালেট রি-ভেরিফিকেশন সিস্টেম" },
  { name: "wallet-binding", label: "ওয়ালেট বাইন্ডিং", desc: "ফেস+ওয়ালেট বাইন্ড করা" },
  { name: "balance-check", label: "ব্যালেন্স চেক", desc: "ইউজারের ব্যালেন্স দেখা" },
  { name: "withdrawal", label: "উইথড্র", desc: "টাকা উইথড্র করা" },
  { name: "key-submit", label: "কী সাবমিট", desc: "ভেরিফিকেশন কী সাবমিট" },
  { name: "user-profile", label: "ইউজার প্রোফাইল", desc: "প্রোফাইল তথ্য দেখা" },
  { name: "user-login", label: "ইউজার লগইন", desc: "গেস্ট আইডি দিয়ে লগইন চেক" },
  { name: "transactions", label: "লেনদেন", desc: "লেনদেনের ইতিহাস" },
  { name: "transfer-request", label: "ট্রান্সফার রিকোয়েস্ট", desc: "ট্রান্সফার রিকোয়েস্ট সিস্টেম" },
  { name: "settings", label: "সেটিংস", desc: "পাবলিক সেটিংস দেখা" },
  { name: "stories", label: "স্টোরিজ", desc: "স্টোরি সিস্টেম" },
  { name: "admin-panel", label: "অ্যাডমিন প্যানেল", desc: "অ্যাডমিন কন্ট্রোল" },
];

export function ApiKeyManager() {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [brandingText, setBrandingText] = useState("Powered by Good-App");
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: apiKeys = [], isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const { data } = await supabase
        .from("api_keys")
        .select("*, api_key_features(*)")
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const toggleFeature = (name: string) => {
    setSelectedFeatures((prev) =>
      prev.includes(name) ? prev.filter((f) => f !== name) : [...prev, name]
    );
  };

  const selectAll = () => setSelectedFeatures(ALL_FEATURES.map((f) => f.name));
  const selectNone = () => setSelectedFeatures([]);

  const createKey = async () => {
    if (!newName.trim()) {
      toast({ title: "নাম দিন", variant: "destructive" });
      return;
    }
    if (selectedFeatures.length === 0) {
      toast({ title: "কমপক্ষে ১টি ফিচার বাছাই করুন", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: newKey, error } = await supabase
        .from("api_keys")
        .insert({ name: newName.trim(), branding_text: brandingText.trim() || "Powered by Good-App" })
        .select()
        .single();
      if (error) throw error;

      const features = selectedFeatures.map((f) => ({
        api_key_id: newKey.id,
        feature_name: f,
        is_enabled: true,
      }));
      await supabase.from("api_key_features").insert(features);

      toast({ title: "API Key তৈরি হয়েছে!" });
      setCreating(false);
      setNewName("");
      setSelectedFeatures([]);
      setBrandingText("Powered by Good-App");
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    } catch (err: any) {
      toast({ title: "ব্যর্থ", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("api_keys").update({ is_active: !current }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    toast({ title: !current ? "সক্রিয় করা হয়েছে" : "নিষ্ক্রিয় করা হয়েছে" });
  };

  const deleteKey = async (id: string) => {
    if (!confirm("এই API Key মুছে ফেলবেন?")) return;
    await supabase.from("api_keys").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    toast({ title: "মুছে ফেলা হয়েছে" });
  };

  const toggleFeatureForKey = async (keyId: string, featureName: string, currentEnabled: boolean) => {
    await supabase
      .from("api_key_features")
      .update({ is_enabled: !currentEnabled })
      .eq("api_key_id", keyId)
      .eq("feature_name", featureName);
    queryClient.invalidateQueries({ queryKey: ["api-keys"] });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "কপি হয়েছে!" });
  };

  const baseUrl = `${window.location.origin.replace('id-preview--', '').replace(/:\d+$/, '')}`;
  const apiBaseUrl = import.meta.env.VITE_SUPABASE_URL
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-api`
    : `${baseUrl}/functions/v1/public-api`;

  return (
    <div className="space-y-4 mt-4">
      {!creating ? (
        <button
          onClick={() => setCreating(true)}
          className="w-full p-3 rounded-xl border-2 border-dashed border-[hsl(var(--primary))]/30 text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/5 flex items-center justify-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          নতুন API Key তৈরি করুন
        </button>
      ) : (
        <div className="glass-card p-4 rounded-xl space-y-3 border border-[hsl(var(--primary))]/30">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Key className="w-4 h-4 text-[hsl(var(--primary))]" />
            নতুন API Key
          </h3>

          <input
            type="text"
            placeholder="API Key এর নাম (যেমন: MyApp)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="input-field w-full text-sm"
          />

          <input
            type="text"
            placeholder="ব্র্যান্ডিং টেক্সট"
            value={brandingText}
            onChange={(e) => setBrandingText(e.target.value)}
            className="input-field w-full text-sm"
          />

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-muted-foreground">ফিচার বাছাই করুন:</p>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-[10px] text-[hsl(var(--primary))] underline">সব নিন</button>
                <button onClick={selectNone} className="text-[10px] text-destructive underline">সব বাদ</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-60 overflow-y-auto">
              {ALL_FEATURES.map((f) => (
                <button
                  key={f.name}
                  onClick={() => toggleFeature(f.name)}
                  className={`p-2 rounded-lg text-left text-[11px] border transition-colors ${
                    selectedFeatures.includes(f.name)
                      ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                      : "border-border/50 text-muted-foreground hover:border-border"
                  }`}
                >
                  <span className="font-bold block">{f.label}</span>
                  <span className="text-[9px] opacity-70">{f.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={createKey}
              disabled={saving}
              className="btn-primary flex-1 text-sm py-2"
            >
              {saving ? "তৈরি হচ্ছে..." : "তৈরি করুন"}
            </button>
            <button
              onClick={() => { setCreating(false); setSelectedFeatures([]); }}
              className="px-4 py-2 rounded-xl bg-secondary/50 text-sm"
            >
              বাতিল
            </button>
          </div>
        </div>
      )}

      <div className="glass-card p-3 rounded-xl">
        <p className="text-[10px] text-muted-foreground mb-1">API Base URL:</p>
        <div className="flex items-center gap-2">
          <code className="text-[11px] text-[hsl(var(--primary))] bg-black/30 px-2 py-1 rounded flex-1 truncate">
            {apiBaseUrl}
          </code>
          <button onClick={() => copyToClipboard(apiBaseUrl)} className="p-1.5 rounded bg-secondary/50 hover:bg-secondary">
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs text-center text-muted-foreground py-4">লোড হচ্ছে...</p>
      ) : apiKeys.length === 0 ? (
        <p className="text-xs text-center text-muted-foreground py-4">কোনো API Key নেই</p>
      ) : (
        apiKeys.map((key: any) => (
          <div key={key.id} className="glass-card p-4 rounded-xl space-y-3 border border-border/30">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm">{key.name}</h4>
                <p className="text-[10px] text-muted-foreground">{key.branding_text}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => toggleActive(key.id, key.is_active)}
                  className={`p-1.5 rounded-lg ${key.is_active ? "text-[hsl(var(--emerald))]" : "text-muted-foreground"}`}
                >
                  {key.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
                <button onClick={() => deleteKey(key.id)} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <code className="text-[11px] bg-black/30 px-2 py-1 rounded flex-1 truncate font-mono">
                {showKey[key.id] ? key.api_key : `${key.api_key?.slice(0, 8)}${"•".repeat(20)}`}
              </code>
              <button onClick={() => setShowKey((p) => ({ ...p, [key.id]: !p[key.id] }))} className="p-1 rounded bg-secondary/50">
                {showKey[key.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => copyToClipboard(key.api_key)} className="p-1 rounded bg-secondary/50">
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1">
                <Settings className="w-3 h-3" /> ফিচার সমূহ:
              </p>
              <div className="flex flex-wrap gap-1">
                {(key.api_key_features || []).map((f: any) => (
                  <button
                    key={f.id}
                    onClick={() => toggleFeatureForKey(key.id, f.feature_name, f.is_enabled)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                      f.is_enabled
                        ? "border-[hsl(var(--emerald))]/50 bg-[hsl(var(--emerald))]/10 text-[hsl(var(--emerald))]"
                        : "border-border/50 bg-secondary/30 text-muted-foreground line-through"
                    }`}
                  >
                    {ALL_FEATURES.find((af) => af.name === f.feature_name)?.label || f.feature_name}
                  </button>
                ))}
              </div>
            </div>

            <details className="text-[10px]">
              <summary className="cursor-pointer text-[hsl(var(--primary))] font-bold">ব্যবহারের নমুনা</summary>
              <pre className="bg-black/40 p-2 rounded mt-1 overflow-x-auto text-[9px] text-green-400 whitespace-pre-wrap">
{`// API ব্যবহার
fetch("${apiBaseUrl}/info", {
  headers: { "x-api-key": "${key.api_key?.slice(0, 8)}..." }
})

// Response এ সবসময় থাকবে:
// "_branding": { "sponsor": "${key.branding_text}" }
// এটা UI তে দেখানো বাধ্যতামূলক`}
              </pre>
            </details>
          </div>
        ))
      )}
    </div>
  );
}
