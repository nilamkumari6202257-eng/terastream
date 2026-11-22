import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Search, Bookmark, Menu, ExternalLink, Home, Compass, Flame, LayoutGrid, Clapperboard } from 'lucide-react';
import { BrandLogo } from '@/components/common/BrandLogo';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { storageService } from '@/services/storageService';
import { SiteSettings } from '@/types/video';

export const Navbar: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settings, setSettings] = useState<SiteSettings>(storageService.getSettings());
  const [watchlistCount, setWatchlistCount] = useState<number>(0);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setSettings(storageService.getSettings());
    setWatchlistCount(storageService.getUserInteractions().watchlist.length);
  }, [location.pathname]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) { navigate(`/browse?search=${encodeURIComponent(searchQuery.trim())}`); setMobileMenuOpen(false); }
  };

  const navLinks = [
    { label: 'Home', path: '/', icon: Home },
    { label: 'Browse', path: '/browse', icon: Compass },
    { label: 'Trending', path: '/browse?sort=trending', icon: Flame },
    { label: 'Categories', path: '/browse?view=categories', icon: LayoutGrid },
    { label: 'Watchlist', path: '/watchlist', icon: Bookmark, badge: watchlistCount > 0 ? watchlistCount : undefined },
  ];

  const isActiveLink = (link: (typeof navLinks)[number]): boolean => {
    if (link.path === '/') return location.pathname === '/';
    const [path, query] = link.path.split('?');
    if (location.pathname !== path) return false;
    if (path === '/browse') {
      if (query) { const [key, value] = query.split('='); return new URLSearchParams(location.search).get(key) === value; }
      const sp = new URLSearchParams(location.search); return !sp.get('sort') && !sp.get('view');
    }
    return true;
  };

  return <header className="sticky top-0 z-40 w-full border-b border-white/[0.07] bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 transition-shadow">
    {settings.showAnnouncement && settings.announcementText && <div className="bg-gradient-to-r from-violet-600/25 via-fuchsia-600/25 to-violet-600/25 border-b border-white/[0.07] py-1.5 px-4 text-center text-xs text-white/90 font-medium flex items-center justify-center gap-2"><span>{settings.announcementText}</span>{settings.announcementLink && <a href={settings.announcementLink} target="_blank" rel="noopener noreferrer" className="underline text-violet-300 hover:text-violet-200 inline-flex items-center gap-0.5 text-[11px]">Learn more <ExternalLink className="h-3 w-3" /></a>}</div>}
    <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
      <Link to="/" className="group flex items-center gap-2.5"><div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-2xl shadow-lg shadow-violet-500/30 ring-1 ring-inset ring-white/20 group-hover:shadow-violet-400/40 group-hover:scale-105 transition-all duration-300">{settings.logoUrl ? <img src={settings.logoUrl} alt="" className="h-full w-full object-cover" /> : <BrandLogo className="h-full w-full" />}</div><div className="flex flex-col leading-none"><span className="font-display text-lg font-extrabold tracking-wide bg-gradient-to-r from-white via-white to-violet-300 bg-clip-text text-transparent">{settings.logoText || 'TERASTREAM'}</span><span className="mt-1 text-[9px] text-violet-300/70 font-semibold tracking-[0.3em] uppercase">Stream in HD</span></div></Link>
      <nav className="hidden md:flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.03] p-1">{navLinks.map((link) => { const isActive = isActiveLink(link); const Icon = link.icon; return <Link key={link.path} to={link.path} className={`relative inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 ${isActive ? 'bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-md shadow-violet-500/30' : 'text-muted-foreground hover:text-white hover:bg-white/[0.06]'}`}><Icon className={`h-3.5 w-3.5 ${isActive ? 'fill-white/20' : ''}`} />{link.label}{link.badge !== undefined && <span className={`ml-0.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-bold ${isActive ? 'bg-white/25 text-white' : 'bg-violet-500 text-white'}`}>{link.badge}</span>}</Link>; })}</nav>
      <div className="flex items-center gap-2.5">
        <form onSubmit={handleSearchSubmit} className="hidden lg:block relative w-64 focus-within:w-80 transition-[width] duration-300"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" /><Input type="search" placeholder="Search videos…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-9 w-full rounded-full border-white/[0.08] bg-white/[0.05] pl-9 pr-4 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:border-violet-400/50 focus-visible:ring-violet-400/30" /></form>
        <Link to="/watchlist" className="hidden md:inline-flex relative h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-muted-foreground hover:text-white hover:border-violet-400/40 hover:bg-violet-500/10 transition-colors" title="My Watchlist"><Bookmark className="h-4 w-4" />{watchlistCount > 0 && <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-[9px] font-bold text-white flex items-center justify-center ring-2 ring-background">{watchlistCount}</span>}</Link>
        <div className="flex md:hidden items-center gap-1"><Link to="/watchlist" className="relative p-2 text-muted-foreground hover:text-white" title="My Watchlist"><Bookmark className="h-5 w-5" />{watchlistCount > 0 && <span className="absolute top-0.5 right-0.5 h-4 min-w-4 px-0.5 rounded-full bg-violet-500 text-[9px] font-bold text-white flex items-center justify-center">{watchlistCount}</span>}</Link><Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}><SheetTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-white/[0.06]"><Menu className="h-5 w-5" /></Button></SheetTrigger><SheetContent side="right" className="bg-card/95 backdrop-blur-xl border-white/[0.08] text-foreground w-72 p-6 flex flex-col"><SheetHeader className="text-left pb-4 border-b border-white/[0.07] mb-4"><SheetTitle className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-400 text-white shadow-md shadow-violet-500/30"><Clapperboard className="h-4 w-4" /></span><span className="font-display text-base font-extrabold tracking-wide">{settings.logoText || 'TERASTREAM'}</span></SheetTitle></SheetHeader><form onSubmit={handleSearchSubmit} className="relative mb-5"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input type="search" placeholder="Search videos…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-10 w-full rounded-xl border-white/[0.08] bg-white/[0.05] pl-10 pr-3 text-xs text-foreground" /></form><div className="flex flex-col gap-1.5">{navLinks.map((link) => { const Icon = link.icon; return <Link key={link.path} to={link.path} onClick={() => setMobileMenuOpen(false)} className="flex items-center justify-between px-3.5 py-3 rounded-xl border border-transparent text-sm font-medium text-foreground hover:bg-white/[0.06] hover:border-white/[0.08] transition-colors"><span className="flex items-center gap-3"><Icon className="h-4 w-4 text-violet-300" />{link.label}</span>{link.badge !== undefined && <span className="h-5 min-w-5 px-1.5 rounded-full bg-violet-500 text-[11px] font-bold text-white flex items-center justify-center">{link.badge}</span>}</Link>; })}</div><div className="mt-auto pt-5 border-t border-white/[0.07] text-[11px] text-muted-foreground">{settings.tagline || 'Movies, anime and series in HD.'}</div></SheetContent></Sheet></div>
      </div>
    </div>
  </header>;
};
