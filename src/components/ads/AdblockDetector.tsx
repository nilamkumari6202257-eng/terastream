import React, { useState, useEffect } from 'react';
import { storageService } from '@/services/storageService';
import { ShieldAlert, X, HeartHandshake } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const AdblockDetector: React.FC = () => {
  const [adblockDetected, setAdblockDetected] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const settings = storageService.getSettings();

  useEffect(() => {
    if (!settings.showAdblockNotice) return;

    // Standard benign adblock bait element test
    const testAd = document.createElement('div');
    testAd.innerHTML = '&nbsp;';
    testAd.className = 'adsbox ad-placement pub_300x250 pub_728x90 text-ad textAds banner-ad';
    testAd.style.position = 'absolute';
    testAd.style.left = '-9999px';
    testAd.style.top = '-9999px';
    testAd.style.height = '1px';
    testAd.style.width = '1px';
    document.body.appendChild(testAd);

    const timer = setTimeout(() => {
      const isBlocked =
        testAd.offsetHeight === 0 ||
        testAd.clientHeight === 0 ||
        window.getComputedStyle(testAd).display === 'none';
      if (isBlocked) {
        setAdblockDetected(true);
      }
      testAd.remove();
    }, 500);

    return () => {
      clearTimeout(timer);
      if (testAd.parentNode) {
        testAd.remove();
      }
    };
  }, [settings.showAdblockNotice]);

  if (!adblockDetected || dismissed || !settings.showAdblockNotice) {
    return null;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-2 my-2 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 backdrop-blur-md text-amber-200">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
            <HeartHandshake className="h-5 w-5" />
          </div>
          <div>
            <h5 className="font-semibold text-sm text-foreground">
              {settings.adblockNoticeTitle || 'Support Our Free Streaming Platform'}
            </h5>
            <p className="text-xs text-muted-foreground">
              {settings.adblockNoticeMessage || 'Please consider disabling your ad-blocker so we can continue providing free HD TeraBox video streaming.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(true)}
            className="h-8 px-3 text-xs text-foreground/80 hover:bg-amber-500/20"
          >
            I Understand
          </Button>
          <button
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
