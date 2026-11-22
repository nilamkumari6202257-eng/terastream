import React, { useState } from 'react';
import { Loader2, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adminApi } from '@/services/adminApi';

type Report = Awaited<ReturnType<typeof adminApi.diagnoseLink>>;

/** Paste a TeraBox link -> see exactly what this server gets back (which token worked, preview-only, which step failed). */
export const StreamDiagnose: React.FC = () => {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState('');

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!link.trim()) return;
    setBusy(true);
    setErr('');
    setReport(null);
    try {
      setReport(await adminApi.diagnoseLink(link.trim()));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Test fail ho gaya');
    } finally {
      setBusy(false);
    }
  };

  const verdict = !report
    ? null
    : !report.ok
      ? { cls: 'text-red-300 border-red-500/30 bg-red-500/10', text: `Fail: ${report.error || 'unknown error'}` }
      : report.preview_only
        ? { cls: 'text-amber-300 border-amber-500/30 bg-amber-500/10', text: `Sirf ~${report.preview_seconds}s ka preview mil raha hai (${report.token_used}). Full video ke liye valid VIP ndus token add karein.` }
        : { cls: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10', text: `Full video chal raha hai (${report.token_used}).` };

  return (
    <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <h3 className="mb-1 flex items-center gap-2 text-base font-bold text-white">
        <Stethoscope className="h-5 w-5 text-primary" /> Video link test
      </h3>
      <p className="mb-4 text-xs text-muted-foreground">
        Koi TeraBox link paste karke dekhein ki is server par wo chal raha hai ya nahi, aur kahan atak raha hai. Token / cookie yahan kabhi nahi dikhte.
      </p>
      <form onSubmit={run} className="flex flex-col gap-2 sm:flex-row">
        <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://1024terabox.com/s/1xxxxxxxx" className="h-10 bg-background/50 text-xs" />
        <Button type="submit" disabled={busy || !link.trim()} className="h-10 shrink-0 text-xs">
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Test link
        </Button>
      </form>
      {err && <p className="mt-3 text-xs text-red-300">{err}</p>}
      {verdict && report && (
        <div className="mt-4 space-y-3">
          <div className={`rounded-xl border px-3 py-2 text-xs font-semibold ${verdict.cls}`}>{verdict.text}</div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-white/70">
            {report.steps.join('\n')}
          </pre>
        </div>
      )}
    </div>
  );
};
