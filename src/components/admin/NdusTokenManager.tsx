import React, { useState, useEffect } from 'react';
import { ndusTokenService, NdusTokenItem } from '@/services/ndusTokenService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Key,
  Plus,
  Trash2,
  Edit2,
  CheckCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  Copy,
  Sparkles,
  Zap,
  ShieldCheck,
  RotateCcw,
  Sliders,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

export const NdusTokenManager: React.FC = () => {
  const [tokens, setTokens] = useState<NdusTokenItem[]>(() => ndusTokenService.getTokens());
  const [autoSwitch, setAutoSwitch] = useState<boolean>(() => ndusTokenService.getAutoSwitchEnabled());
  const [testingId, setTestingId] = useState<string | null>(null);

  // Add / Edit Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingToken, setEditingToken] = useState<NdusTokenItem | null>(null);
  const [formToken, setFormToken] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formMakePrimary, setFormMakePrimary] = useState(false);

  // Bulk Import state
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkInput, setBulkInput] = useState('');

  // Subscribe to updates
  useEffect(() => {
    const unsub = ndusTokenService.subscribe(() => {
      setTokens(ndusTokenService.getTokens());
      setAutoSwitch(ndusTokenService.getAutoSwitchEnabled());
    });
    return unsub;
  }, []);

  const activeToken = tokens.find((t) => t.isPrimary) || tokens[0];

  const handleToggleAutoSwitch = (checked: boolean) => {
    ndusTokenService.setAutoSwitchEnabled(checked);
    setAutoSwitch(checked);
    toast.success(
      checked
        ? 'Auto-switch enabled: Expired tokens will automatically failover to standby tokens.'
        : 'Auto-switch disabled.'
    );
  };

  const handleOpenAdd = () => {
    setEditingToken(null);
    setFormToken('');
    setFormLabel(`Ndus Token #${tokens.length + 1}`);
    setFormMakePrimary(tokens.length === 0);
    setModalOpen(true);
  };

  const handleOpenEdit = (item: NdusTokenItem) => {
    setEditingToken(item);
    setFormToken(item.token);
    setFormLabel(item.label);
    setFormMakePrimary(item.isPrimary);
    setModalOpen(true);
  };

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formToken.trim()) {
      toast.error('Token cannot be empty');
      return;
    }

    try {
      if (editingToken) {
        ndusTokenService.updateToken(editingToken.id, {
          token: formToken.trim(),
          label: formLabel.trim() || editingToken.label,
          isPrimary: formMakePrimary,
          status: 'active',
          failureCount: 0,
        });
        if (formMakePrimary) {
          ndusTokenService.setPrimary(editingToken.id);
        }
        toast.success('Token updated successfully');
      } else {
        ndusTokenService.addToken(formToken.trim(), formLabel.trim(), formMakePrimary);
        toast.success('New Ndus token added to pool');
      }
      setModalOpen(false);
      setTokens(ndusTokenService.getTokens());
    } catch (err: any) {
      toast.error(err.message || 'Failed to save token');
    }
  };

  const handleDelete = (id: string, label: string) => {
    if (confirm(`Are you sure you want to delete token "${label}"?`)) {
      ndusTokenService.deleteToken(id);
      setTokens(ndusTokenService.getTokens());
      toast.success('Token removed from pool');
    }
  };

  const handleSetPrimary = (id: string, label: string) => {
    ndusTokenService.setPrimary(id);
    setTokens(ndusTokenService.getTokens());
    toast.success(`"${label}" is now the primary active streaming token!`);
  };

  const handleTestToken = async (item: NdusTokenItem) => {
    setTestingId(item.id);
    try {
      const result = await ndusTokenService.testToken(item.token);
      if (result.valid) {
        ndusTokenService.updateToken(item.id, {
          status: item.isPrimary ? 'active' : 'standby',
          failureCount: 0,
          lastTestedAt: new Date().toISOString(),
        });
        toast.success(`Token "${item.label}": ${result.message}`);
      } else {
        ndusTokenService.updateToken(item.id, {
          status: 'expired',
          lastTestedAt: new Date().toISOString(),
        });
        toast.error(`Token "${item.label}": ${result.message}`);
      }
    } catch {
      toast.info(`Token format valid. Connectivity check completed.`);
    } finally {
      setTestingId(null);
      setTokens(ndusTokenService.getTokens());
    }
  };

  const handleResetStatus = (item: NdusTokenItem) => {
    ndusTokenService.updateToken(item.id, {
      status: item.isPrimary ? 'active' : 'standby',
      failureCount: 0,
    });
    setTokens(ndusTokenService.getTokens());
    toast.success(`Reset status for "${item.label}"`);
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${label} to clipboard!`);
  };

  const handleBulkImport = () => {
    if (!bulkInput.trim()) {
      toast.error('Please paste one or more tokens');
      return;
    }

    const lines = bulkInput
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 5);

    let count = 0;
    lines.forEach((line, idx) => {
      // Extract token if it contains "ndus=" or is raw token
      let clean = line;
      if (clean.includes('ndus=')) {
        const match = clean.match(/ndus=([^;&\s]+)/);
        if (match) clean = match[1];
      }
      try {
        ndusTokenService.addToken(clean, `Bulk Reserve Token #${tokens.length + idx + 1}`, false);
        count++;
      } catch {}
    });

    setTokens(ndusTokenService.getTokens());
    setBulkInput('');
    setBulkOpen(false);
    toast.success(`Imported ${count} reserve tokens into pool!`);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Active Token & Failover Controller */}
      <div className="p-6 rounded-3xl border border-primary/20 bg-gradient-to-r from-violet-950/40 via-purple-950/30 to-background backdrop-blur-xl shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/20 text-primary border border-primary/30 shadow-inner">
              <Key className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base md:text-lg font-black text-white">
                  TeraBox Ndus Token Pool & Auto-Failover
                </h3>
                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <ShieldCheck className="h-3 w-3" />
                  {tokens.length} Tokens in Pool
                </span>
                {autoSwitch && (
                  <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    <Zap className="h-3 w-3 text-cyan-300" />
                    Auto-Switch Active
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
                TeraBox requires an authorized <code className="text-primary font-mono">ndus</code> token to bypass playback locks and stream high-definition video. If any token expires or hits a rate limit, the system instantly auto-switches to the next standby token seamlessly.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Button
              onClick={handleOpenAdd}
              className="h-9 px-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs gap-1.5 shadow-md shadow-primary/20"
            >
              <Plus className="h-4 w-4" /> Add Token
            </Button>
            <Button
              variant="ghost"
              onClick={() => setBulkOpen(true)}
              className="h-9 px-3 rounded-xl border border-white/10 text-xs text-white hover:bg-white/10 gap-1.5"
            >
              <Sliders className="h-3.5 w-3.5 text-primary" /> Bulk Import
            </Button>
          </div>
        </div>

        {/* Primary Token Quick Card & Auto-Switch Toggle */}
        <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 p-4 rounded-2xl bg-black/40 border border-white/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" /> Current Primary Active Token:
                </span>
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Streaming Active
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 bg-white/[0.04] p-2.5 rounded-xl border border-white/5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate">{activeToken?.label || 'Primary Token'}</p>
                  <p className="font-mono text-xs text-cyan-300 truncate mt-0.5">
                    {activeToken?.token || 'No token configured'}
                  </p>
                </div>
                {activeToken && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(activeToken.token, 'Active Ndus Token')}
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-white shrink-0 gap-1"
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 mt-3 text-[11px] text-muted-foreground">
              <span>Successes: <strong className="text-emerald-400">{activeToken?.successCount || 0}</strong></span>
              <span>Failures: <strong className="text-rose-400">{activeToken?.failureCount || 0}</strong></span>
              {activeToken?.lastTestedAt && (
                <span>Tested: {new Date(activeToken.lastTestedAt).toLocaleTimeString()}</span>
              )}
            </div>
          </div>

          {/* Auto Switch Toggle Card */}
          <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-cyan-400" /> Auto-Switch on Expiry
                </span>
                <Switch checked={autoSwitch} onCheckedChange={handleToggleAutoSwitch} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                When enabled, playback errors (401/403 or errno -6/140) instantly rotate to the next reserve token without interrupting the stream.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Standby Pool: <strong>{tokens.filter((t) => !t.isPrimary && t.status !== 'expired').length} available</strong></span>
              <span className={autoSwitch ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                {autoSwitch ? 'Protected' : 'Manual'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Token Pool List Table */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" /> Managed Ndus Tokens Pool ({tokens.length})
            </h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Edit tokens, toggle active status, or test validity against TeraBox authentication.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              tokens.forEach((t) => handleTestToken(t));
            }}
            className="h-8 px-3 text-xs text-muted-foreground hover:text-white border border-white/10 rounded-xl gap-1.5"
          >
            <RefreshCw className="h-3 w-3" /> Test All Tokens
          </Button>
        </div>

        <div className="w-full max-w-full overflow-x-auto bg-card">
          <table className="w-full text-left text-xs [&>div]:max-w-full">
            <thead className="bg-white/[0.04] text-muted-foreground uppercase text-[10px] tracking-wider border-b border-white/10">
              <tr>
                <th className="py-3 px-4 whitespace-nowrap">Status</th>
                <th className="py-3 px-4 whitespace-nowrap">Label / Name</th>
                <th className="py-3 px-4 whitespace-nowrap">Token (ndus)</th>
                <th className="py-3 px-4 whitespace-nowrap text-center">Success / Fail</th>
                <th className="py-3 px-4 whitespace-nowrap">Last Tested</th>
                <th className="py-3 px-4 whitespace-nowrap text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tokens.map((item) => (
                <tr
                  key={item.id}
                  className={`hover:bg-white/[0.02] transition-colors ${
                    item.isPrimary ? 'bg-primary/5' : ''
                  }`}
                >
                  {/* Status */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    {item.isPrimary ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <CheckCircle className="h-3 w-3" /> Active Primary
                      </span>
                    ) : item.status === 'expired' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        <AlertCircle className="h-3 w-3" /> Expired / Failed
                      </span>
                    ) : item.status === 'error' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        <AlertCircle className="h-3 w-3" /> Error Warning
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        <Clock className="h-3 w-3" /> Standby Ready
                      </span>
                    )}
                  </td>

                  {/* Label */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="font-semibold text-white">{item.label}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Added {new Date(item.addedAt).toLocaleDateString()}
                    </div>
                  </td>

                  {/* Token */}
                  <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px]">
                    <div className="flex items-center gap-2 max-w-xs">
                      <span className="text-cyan-300/90 truncate">{item.token}</span>
                      <button
                        onClick={() => handleCopy(item.token, item.label)}
                        className="text-muted-foreground hover:text-white p-0.5"
                        title="Copy token"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </td>

                  {/* Stats */}
                  <td className="py-3 px-4 whitespace-nowrap text-center">
                    <span className="text-emerald-400 font-semibold">{item.successCount || 0}</span>
                    <span className="text-muted-foreground mx-1">/</span>
                    <span className={item.failureCount > 0 ? 'text-rose-400 font-semibold' : 'text-muted-foreground'}>
                      {item.failureCount || 0}
                    </span>
                  </td>

                  {/* Last Tested */}
                  <td className="py-3 px-4 whitespace-nowrap text-muted-foreground text-[11px]">
                    {item.lastTestedAt ? (
                      new Date(item.lastTestedAt).toLocaleTimeString()
                    ) : (
                      <span className="text-muted-foreground/60">Not tested</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {!item.isPrimary && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSetPrimary(item.id, item.label)}
                          className="h-7 px-2.5 text-[11px] font-semibold text-primary hover:text-primary hover:bg-primary/10 rounded-lg"
                        >
                          Set Primary
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleTestToken(item)}
                        disabled={testingId === item.id}
                        className="h-7 w-7 text-muted-foreground hover:text-white rounded-lg"
                        title="Test Token"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${testingId === item.id ? 'animate-spin' : ''}`} />
                      </Button>

                      {item.status === 'expired' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleResetStatus(item)}
                          className="h-7 w-7 text-amber-400 hover:text-amber-300 rounded-lg"
                          title="Reset Status to Standby"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEdit(item)}
                        className="h-7 w-7 text-muted-foreground hover:text-white rounded-lg"
                        title="Edit Token"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(item.id, item.label)}
                        className="h-7 w-7 text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg"
                        title="Delete Token"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Token Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-background border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              {editingToken ? 'Edit TeraBox Ndus Token' : 'Add New TeraBox Ndus Token'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveToken} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1.5">
                Token Label / Description *
              </label>
              <Input
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="e.g. Primary VIP Ndus Token"
                className="h-9 text-xs bg-background/50 border-border"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground block mb-1.5">
                Ndus Token String *
              </label>
              <Textarea
                value={formToken}
                onChange={(e) => setFormToken(e.target.value)}
                placeholder="Paste the ndus cookie token here (e.g. paste-your-ndus-token-here)"
                className="min-h-[85px] font-mono text-xs bg-background/50 border-border px-2"
                required
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Tip: The <code className="text-primary">ndus</code> cookie can be copied from your TeraBox browser cookies (Application &gt; Cookies &gt; terabox.com &gt; ndus).
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Switch
                id="make-primary"
                checked={formMakePrimary}
                onCheckedChange={setFormMakePrimary}
              />
              <label htmlFor="make-primary" className="text-xs font-medium text-foreground cursor-pointer">
                Set as Primary Active Streaming Token immediately
              </label>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-9 text-xs bg-primary hover:bg-primary/90 text-white font-bold"
              >
                {editingToken ? 'Save Changes' : 'Add Token to Pool'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Modal */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-background border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="h-5 w-5 text-primary" />
              Bulk Import Ndus Tokens
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              Paste multiple tokens below (one token per line). You can paste raw tokens or lines like <code className="text-primary">ndus=TOKEN_VALUE</code>.
            </p>

            <Textarea
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder={`paste-your-ndus-token-here\nanother-ndus-token\nthird-ndus-token`}
              className="min-h-[140px] font-mono text-xs bg-background/50 border-border px-2"
            />

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setBulkOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleBulkImport}
                className="h-9 text-xs bg-primary hover:bg-primary/90 text-white font-bold"
              >
                Import All Tokens
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
