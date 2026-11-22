import React from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Send, Twitter, Zap, MonitorPlay, ShieldCheck, Sparkles } from 'lucide-react';
import { BrandLogo } from '@/components/common/BrandLogo';
import { storageService } from '@/services/storageService';

const realLink = (url?: string): string => {
  if (!url) return '';
  try {
    const u = new URL(url.trim());
    return u.pathname.replace(/\//g, '') || u.search ? url.trim() : '';
  } catch {
    return '';
  }
};

const features = [
  { icon: MonitorPlay, label: 'Smooth HD player' },
  { icon: Zap, label: 'Daily fresh drops' },
  { icon: ShieldCheck, label: 'No signup needed' },
  { icon: Sparkles, label: 'Personal watchlist' },
];

export const Footer: React.FC = () => {
  const settings = storageService.getSettings();
  const categories = storageService.getCategories();

  return (
    <footer className="relative mt-16 text-foreground">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />
      <div className="border-t border-white/[0.05] bg-card/40 backdrop-blur-md pt-12 pb-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-10 mb-10 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <Link to="/" className="group flex items-center gap-2.5 mb-4">
                <div className="h-9 w-9 overflow-hidden rounded-xl shadow-md shadow-violet-500/25 ring-1 ring-inset ring-white/20 group-hover:scale-105 transition-transform">
                  {settings.logoUrl ? <img src={settings.logoUrl} alt="" className="h-full w-full object-cover" /> : <BrandLogo className="h-full w-full" />}
                </div>
                <span className="font-display text-base font-extrabold tracking-wide text-white">{settings.logoText || 'TERASTREAM'}</span>
              </Link>
              <p className="text-xs text-muted-foreground leading-relaxed mb-5 max-w-xs">{settings.tagline || 'Movies, anime and series in HD.'}</p>
              <div className="flex items-center gap-2.5">
                {realLink(settings.telegramUrl) && <a href={realLink(settings.telegramUrl)} target="_blank" rel="noopener noreferrer" className="h-9 w-9 rounded-full border border-white/[0.08] bg-white/[0.04] flex items-center justify-center text-muted-foreground hover:text-white hover:border-violet-400/40 hover:bg-violet-500/10 transition-all" title="Telegram"><Send className="h-4 w-4" /></a>}
                {realLink(settings.whatsappUrl) && <a href={realLink(settings.whatsappUrl)} target="_blank" rel="noopener noreferrer" className="h-9 w-9 rounded-full border border-white/[0.08] bg-white/[0.04] flex items-center justify-center text-muted-foreground hover:text-white hover:border-violet-400/40 hover:bg-violet-500/10 transition-all" title="WhatsApp"><MessageCircle className="h-4 w-4" /></a>}
                {realLink(settings.twitterUrl) && <a href={realLink(settings.twitterUrl)} target="_blank" rel="noopener noreferrer" className="h-9 w-9 rounded-full border border-white/[0.08] bg-white/[0.04] flex items-center justify-center text-muted-foreground hover:text-white hover:border-violet-400/40 hover:bg-violet-500/10 transition-all" title="Twitter / X"><Twitter className="h-4 w-4" /></a>}
              </div>
            </div>
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/80 mb-4">Navigation</h4>
              <ul className="space-y-2.5 text-xs text-muted-foreground">
                <li><Link to="/" className="hover:text-violet-300 transition-colors">Home</Link></li>
                <li><Link to="/browse" className="hover:text-violet-300 transition-colors">Browse Videos</Link></li>
                <li><Link to="/browse?sort=trending" className="hover:text-violet-300 transition-colors">Trending Now</Link></li>
                <li><Link to="/watchlist" className="hover:text-violet-300 transition-colors">My Watchlist</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/80 mb-4">Categories</h4>
              <ul className="space-y-2.5 text-xs text-muted-foreground">{categories.slice(0, 5).map((cat) => <li key={cat.id}><Link to={`/browse?category=${cat.slug}`} className="hover:text-violet-300 transition-colors">{cat.name}</Link></li>)}</ul>
            </div>
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/80 mb-4">Why TeraStream</h4>
              <ul className="space-y-3 text-xs text-muted-foreground">{features.map((f) => <li key={f.label} className="flex items-center gap-2.5"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-violet-400/20 bg-violet-500/10 text-violet-300"><f.icon className="h-3.5 w-3.5" /></span>{f.label}</li>)}</ul>
            </div>
          </div>
          <div className="pt-6 border-t border-white/[0.06] space-y-3 text-xs text-muted-foreground">
            <p className="text-[11px] text-muted-foreground/70 leading-normal max-w-3xl">Disclaimer: This platform embeds user-submitted links. We do not host or store any video files on our servers.</p>
            {settings.footerText && <p>{settings.footerText}</p>}
            <p className="text-muted-foreground/60">© {new Date().getFullYear()} {settings.logoText || 'TeraStream'}. All rights reserved.</p>
          </div>
        </div>
      </div>
    </footer>
  );
};
