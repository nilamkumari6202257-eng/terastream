import React from 'react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { AdSlot } from '@/components/ads/AdSlot';
import { AdblockDetector } from '@/components/ads/AdblockDetector';

interface MainLayoutProps { children: React.ReactNode; showTopAd?: boolean; hideAds?: boolean; }

export const MainLayout: React.FC<MainLayoutProps> = ({ children, showTopAd = true, hideAds = false }) => <div className="flex flex-col min-h-screen bg-background text-foreground antialiased selection:bg-primary/30 selection:text-white">
  <Navbar />
  {!hideAds && <AdblockDetector />}
  {showTopAd && !hideAds && <div className="mx-auto w-full max-w-7xl px-4 pt-3 opacity-90"><AdSlot position="header_top" /></div>}
  <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">{children}</main>
  {!hideAds && <AdSlot position="sticky_bottom" />}
  {!hideAds && <AdSlot position="social_bar" />}
  <Footer />
</div>;
