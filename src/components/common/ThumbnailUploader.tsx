import React, { useRef, useState } from 'react';
import { Image as ImageIcon, Link as LinkIcon, RefreshCw, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface ThumbnailUploaderProps { value: string; onChange: (value: string) => void; className?: string; }
const PRESETS = [
  ['Anime Aesthetic', 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1280&auto=format&fit=crop&q=80'],
  ['Cinematic Ocean', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1280&auto=format&fit=crop&q=80'],
  ['Cyberpunk Neon', 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=1280&auto=format&fit=crop&q=80'],
  ['Deep Blue', 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1280&auto=format&fit=crop&q=80'],
];

export const ThumbnailUploader: React.FC<ThumbnailUploaderProps> = ({ value, onChange, className = '' }) => {
  const [mode, setMode] = useState<'upload' | 'preset' | 'url'>('upload');
  const [ratio, setRatio] = useState<'16:9' | '9:16'>('16:9');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const process = (file: File) => {
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image file');
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const target = ratio === '16:9' ? 1280 / 720 : 720 / 1280;
        let width = image.width;
        let height = Math.round(width / target);
        if (height > image.height) { height = image.height; width = Math.round(height * target); }
        const sx = Math.max(0, Math.round((image.width - width) / 2));
        const sy = Math.max(0, Math.round((image.height - height) / 2));
        const canvas = document.createElement('canvas'); canvas.width = ratio === '16:9' ? 1280 : 720; canvas.height = ratio === '16:9' ? 720 : 1280;
        canvas.getContext('2d')?.drawImage(image, sx, sy, width, height, 0, 0, canvas.width, canvas.height);
        onChange(canvas.toDataURL('image/jpeg', 0.82)); setBusy(false); toast.success(`${ratio} thumbnail ready`);
      };
      image.onerror = () => { setBusy(false); toast.error('Could not process this image'); };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return <div className={`space-y-3 ${className}`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-1.5 text-xs font-semibold"><ImageIcon className="h-3.5 w-3.5 text-primary" /> Thumbnail poster</label><div className="flex rounded-lg border border-white/10 bg-white/[0.04] p-0.5"><button type="button" onClick={() => setRatio('16:9')} className={`rounded px-2 py-1 text-[10px] ${ratio === '16:9' ? 'bg-primary text-white' : 'text-muted-foreground'}`}>16:9 Landscape</button><button type="button" onClick={() => setRatio('9:16')} className={`rounded px-2 py-1 text-[10px] ${ratio === '9:16' ? 'bg-primary text-white' : 'text-muted-foreground'}`}>9:16 Portrait</button></div></div>
    <div className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.04] p-1"><button type="button" onClick={() => setMode('upload')} className={`rounded px-2 py-1 text-[11px] ${mode === 'upload' ? 'bg-white/10 text-white' : 'text-muted-foreground'}`}>Upload</button><button type="button" onClick={() => setMode('preset')} className={`rounded px-2 py-1 text-[11px] ${mode === 'preset' ? 'bg-white/10 text-white' : 'text-muted-foreground'}`}>Presets</button><button type="button" onClick={() => setMode('url')} className={`rounded px-2 py-1 text-[11px] ${mode === 'url' ? 'bg-white/10 text-white' : 'text-muted-foreground'}`}>Web URL</button></div>
    {value && <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-black/20 ${ratio === '9:16' ? 'mx-auto max-w-[220px] aspect-[9/16]' : 'aspect-video'}`}><img src={value} alt="Thumbnail preview" className="h-full w-full object-cover" /><button type="button" onClick={() => onChange('')} className="absolute right-2 top-2 rounded-full bg-black/70 p-2 text-white"><X className="h-3.5 w-3.5" /></button></div>}
    <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && process(e.target.files[0])} />
    {mode === 'upload' && <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.02] p-6 text-center hover:border-primary/50"><div className="rounded-2xl bg-primary/10 p-3 text-primary">{busy ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}</div><span className="text-xs font-semibold text-white">Choose a {ratio} thumbnail</span><span className="text-[11px] text-muted-foreground">Image is center-cropped and optimized automatically</span></button>}
    {mode === 'preset' && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{PRESETS.map(([name, src]) => <button type="button" key={name} onClick={() => onChange(src)} className="group overflow-hidden rounded-xl border border-white/10 text-left"><img src={src} alt={name} className="aspect-video h-full w-full object-cover transition group-hover:scale-105" /><span className="block truncate p-1.5 text-[10px] text-white/70">{name}</span></button>)}</div>}
    {mode === 'url' && <div className="flex gap-2"><div className="relative flex-1"><LinkIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://image-url..." className="h-9 pl-9 text-xs" /></div><Button type="button" onClick={() => url.trim() && onChange(url.trim())} className="h-9 text-xs">Apply</Button></div>}
  </div>;
};
