import { useQuery } from "@tanstack/react-query";
import { getUserTransactions } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { ArrowDownLeft, ArrowUpRight, History, CheckCircle2, Clock, XCircle, ShieldCheck, Hourglass, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { motion } from "framer-motion";

export function TransactionList() {
  const { user } = useAuth();
  const { data: transactions, isLoading } = useQuery({
    queryKey: ["transactions", user?.id],
    queryFn: () => getUserTransactions(user!.id),
    enabled: !!user,
  });

  if (isLoading) {
    return <div className="p-6 text-center text-muted-foreground animate-pulse">ইতিহাস লোড হচ্ছে...</div>;
  }

  if (!transactions || transactions.length === 0) {
    return (
      <div className="p-8 text-center glass-card rounded-2xl">
        <History className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
        <p className="text-muted-foreground">এখনো কোনো লেনদেন হয়নি</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-border bg-secondary/30">
        <h3 className="font-semibold flex items-center gap-2">
          <History className="w-4 h-4 text-primary" /> সাম্প্রতিক ইতিহাস
        </h3>
      </div>
      <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
        {transactions.map((tx) => {
          const isPending = tx.status === "pending";
          const isRejected = tx.status === "rejected";
          const isEarning = tx.type === "earning";
          const isFirstVerify = isEarning && isPending;
          const isCompleted = isEarning && !isPending && !isRejected;

          return (
            <motion.div
              key={tx.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className={`relative p-4 transition-all flex items-center justify-between overflow-hidden ${
                isFirstVerify
                  ? "bg-gradient-to-r from-[hsl(var(--amber))]/10 via-transparent to-transparent border-l-2 border-[hsl(var(--amber))]"
                  : isCompleted
                  ? "bg-gradient-to-r from-[hsl(var(--emerald))]/10 via-transparent to-transparent border-l-2 border-[hsl(var(--emerald))]"
                  : "hover:bg-secondary/20"
              }`}
            >
              {isCompleted && (
                <Sparkles className="pointer-events-none absolute top-2 right-2 w-3 h-3 text-[hsl(var(--emerald))]/60 animate-pulse" />
              )}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`p-2.5 rounded-xl shadow-sm flex-shrink-0 ${
                    isRejected
                      ? "bg-destructive/15 text-destructive"
                      : isFirstVerify
                      ? "bg-gradient-to-br from-[hsl(var(--amber))]/25 to-[hsl(var(--amber))]/10 text-[hsl(var(--amber))]"
                      : isCompleted
                      ? "bg-gradient-to-br from-[hsl(var(--emerald))]/25 to-[hsl(var(--emerald))]/10 text-[hsl(var(--emerald))]"
                      : "bg-[hsl(var(--orange))]/15 text-[hsl(var(--orange))]"
                  }`}
                >
                  {isFirstVerify ? (
                    <Hourglass className="w-5 h-5" />
                  ) : isCompleted ? (
                    <ShieldCheck className="w-5 h-5" />
                  ) : isEarning ? (
                    <ArrowDownLeft className="w-5 h-5" />
                  ) : (
                    <ArrowUpRight className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">
                    {isFirstVerify
                      ? "১ম ভেরিফাই সম্পন্ন"
                      : isCompleted
                      ? "অ্যাকাউন্ট Complete"
                      : isEarning
                      ? "আয়"
                      : `উইথড্র: ${tx.details}`}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {isFirstVerify
                      ? "Re-verify করলে Balance যোগ হবে"
                      : isCompleted
                      ? "Re-verify সফল — Balance যোগ হয়েছে"
                      : ""}
                  </p>
                  <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                    {format(new Date(tx.created_at || Date.now()), "MMM d, h:mm a")}
                  </p>
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-2">
                {isFirstVerify ? (
                  <p className="font-black text-[hsl(var(--amber))] text-sm">পেন্ডিং</p>
                ) : isCompleted ? (
                  <p className="font-black text-[hsl(var(--emerald))]">+৳{tx.amount}</p>
                ) : isEarning ? (
                  <p className="font-bold text-primary">+৳{tx.amount}</p>
                ) : (
                  <p className={`font-bold ${isRejected ? "text-destructive" : "text-[hsl(var(--orange))]"}`}>
                    -৳{tx.amount}
                  </p>
                )}
                <div className="flex items-center justify-end gap-1 mt-1">
                  {isPending ? (
                    <><Clock className="w-3 h-3 text-[hsl(var(--amber))]" /><span className="text-[10px] text-[hsl(var(--amber))] uppercase font-bold">Pending</span></>
                  ) : isRejected ? (
                    <><XCircle className="w-3 h-3 text-destructive" /><span className="text-[10px] text-destructive uppercase font-bold">Rejected</span></>
                  ) : (
                    <><CheckCircle2 className="w-3 h-3 text-[hsl(var(--emerald))]" /><span className="text-[10px] text-[hsl(var(--emerald))] uppercase font-bold">Complete</span></>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
