import { useState } from "react";
import { Key, Users, Loader2, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPoolStats, addPoolKey } from "@/lib/api";
import { useNavigate } from "react-router-dom";

export default function AddKeys() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [isNameSet, setIsNameSet] = useState(false);
  const [newPrivateKey, setNewPrivateKey] = useState("");
  const [newVerifyUrl, setNewVerifyUrl] = useState("");

  const { data: pool } = useQuery({
    queryKey: ["pool-stats"],
    queryFn: getPoolStats,
  });

  const addPoolMutation = useMutation({
    mutationFn: () => addPoolKey(newPrivateKey, newVerifyUrl, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pool-stats"] });
      setNewPrivateKey("");
      setNewVerifyUrl("");
      toast({ title: "কি পুলে যোগ করা হয়েছে" });
    },
  });

  const readyKeys = pool?.filter(item => !item.is_used) || [];
  const grouped: Record<string, number> = {};
  readyKeys.forEach(item => {
    const n = item.added_by || "Unknown";
    if (n !== "Unknown") grouped[n] = (grouped[n] || 0) + 1;
  });
  const names = Object.keys(grouped);

  return (
    <div className="min-h-screen bg-background p-4 max-w-lg mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 py-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Key className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-black">পুলে কি যোগ করুন</h1>
          <p className="text-sm text-muted-foreground mt-1">নাম দিয়ে ঢুকে Private Key ও Link যোগ করুন</p>
        </div>

        <section className="glass-card p-4 rounded-2xl border border-border">
          <p className="text-xs text-muted-foreground font-bold mb-3">আপনার যোগ করা কি:</p>
          {readyKeys.length > 0 ? (
            <div className="flex items-center justify-between bg-secondary/50 border border-border rounded-xl p-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center"><Users className="w-4 h-4 text-primary" /></div>
                <span className="text-sm font-bold">{name || "আপনি"}</span>
              </div>
              <span className="text-sm font-black bg-primary/20 text-primary px-3 py-1 rounded-lg">{readyKeys.length}টি কি</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">আপনি এখনো কোনো কি যোগ করেননি</p>
          )}
          <p className="text-[10px] text-muted-foreground text-center mt-3">আপনার মোট রেডি কি: {readyKeys.length}টি</p>
        </section>

        <AnimatePresence mode="wait">
          {!isNameSet ? (
            <motion.section key="name-step" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
              className="glass-card p-6 rounded-2xl border border-border">
              <p className="text-sm text-muted-foreground text-center mb-4">কি যোগ করতে আপনার নাম দিন</p>
              <div className="space-y-4">
                <input type="text" placeholder="আপনার নাম লিখুন..." value={name} onChange={(e) => setName(e.target.value)} className="input-field text-lg" />
                <button onClick={() => name.trim() && setIsNameSet(true)} className="btn-primary py-4 font-black" disabled={!name.trim()}>এগিয়ে যান →</button>
              </div>
            </motion.section>
          ) : (
            <motion.section key="add-step" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="glass-card p-6 rounded-2xl border border-border">
              <div className="flex items-center justify-between bg-primary/10 border border-primary/30 rounded-xl p-3 mb-4">
                <div className="flex items-center gap-2"><Users className="w-4 h-4 text-primary" /><span className="text-sm font-bold text-primary">{name}</span></div>
                <button onClick={() => setIsNameSet(false)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">পরিবর্তন করুন</button>
              </div>
              <div className="space-y-4">
                <input type="text" placeholder="Private Key..." value={newPrivateKey} onChange={(e) => setNewPrivateKey(e.target.value)} className="input-field" />
                <input type="text" placeholder="Verification Link (GoodID URL)..." value={newVerifyUrl} onChange={(e) => setNewVerifyUrl(e.target.value)} className="input-field" />
                <button onClick={() => addPoolMutation.mutate()} className="btn-primary py-4 font-black"
                  disabled={addPoolMutation.isPending || !newPrivateKey.trim() || !newVerifyUrl.trim()}>
                  {addPoolMutation.isPending ? <Loader2 className="animate-spin" /> : <><Key className="w-5 h-5" /> Add to Pool</>}
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        <button onClick={() => navigate("/")} className="w-full py-3 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2">
          <ArrowLeft className="w-4 h-4" /> হোম পেজে ফিরে যান
        </button>
      </motion.div>
    </div>
  );
}
