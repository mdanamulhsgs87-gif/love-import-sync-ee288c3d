import { AlertTriangle } from "lucide-react";

interface MaintenanceScreenProps {
  notice: string;
}

function AutoLinkText({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export function MaintenanceScreen({ notice }: MaintenanceScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="glass-card rounded-2xl p-8 max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-10 h-10 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">🔧 সাময়িকভাবে বন্ধ</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          অ্যাপটি বর্তমানে মেইনটেন্যান্স মোডে আছে। দয়া করে কিছুক্ষণ পর আবার চেষ্টা করুন।
        </p>
        {notice && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4">
            <p className="text-sm text-foreground whitespace-pre-wrap">
              <AutoLinkText text={notice} />
            </p>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Powered by Good-App</p>
      </div>
    </div>
  );
}
