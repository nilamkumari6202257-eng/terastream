import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { AdPosition, AdUnit } from '@/types/video';
import { storageService } from '@/services/storageService';
import { adsterraService } from '@/services/adsterraService';
import { SLOT_BY_POSITION, hasRunnableCode, parseAdSize } from '@/services/adsConfig';
import { useStoreVersion } from '@/hooks/useStoreVersion';

interface AdSlotProps {
  position: AdPosition;
  className?: string;
}

const MOBILE_QUERY = '(max-width: 767px)';

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mobile;
}

let frameCounter = 0;

/** Each ad lives in its own sandboxed iframe: scripts from different ads (atOptions etc.) cannot clash,
 *  an ad cannot break the page layout, and nothing here blocks the main thread. */
function buildSrcDoc(code: string, frameId: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}body{display:flex;justify-content:center;align-items:flex-start}</style></head><body>${code}<script>(function(){var id=${JSON.stringify(frameId)};function r(){var h=document.body.offsetHeight;parent.postMessage({cmAd:id,h:h},"*")}try{new ResizeObserver(r).observe(document.body)}catch(e){}window.addEventListener("load",r);setInterval(r,1500);r()})();</script></body></html>`;
}

const SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-forms';

export const AdFrame: React.FC<{ code: string; fixed: { w: number; h: number } | null; eager: boolean }> = ({ code, fixed, eager }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const frameId = useMemo(() => `cmad-${++frameCounter}`, []);
  const [visible, setVisible] = useState(false);
  const [boxW, setBoxW] = useState(0);
  const [autoH, setAutoH] = useState(0);

  // lazy: only start loading the ad when it is close to the screen (or after idle for sticky ads)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (eager || typeof IntersectionObserver === 'undefined') {
      const t = window.setTimeout(() => setVisible(true), 400);
      return () => window.clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '400px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [eager]);

  // track available width (for scaling fixed-size banners down on small phones)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setBoxW(el.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // native banners report their real height
  useEffect(() => {
    if (fixed) return;
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const d = e.data as { cmAd?: string; h?: number } | null;
      if (d && d.cmAd === frameId && typeof d.h === 'number') setAutoH(Math.min(Math.max(0, Math.round(d.h)), 1200));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [fixed, frameId]);

  const scale = fixed && boxW > 0 ? Math.min(1, boxW / fixed.w) : 1;
  const outerStyle: React.CSSProperties = fixed
    ? { width: Math.round(fixed.w * scale), height: Math.round(fixed.h * scale) }
    : { width: '100%', height: autoH };

  const srcDoc = useMemo(() => (visible ? buildSrcDoc(code, frameId) : ''), [visible, code, frameId]);
  const loaded = fixed ? visible : autoH > 8;

  return (
    <div ref={wrapRef} className="cm-ad-wrap">
      {loaded && <span className="cm-ad-label">Advertisement</span>}
      <div className="cm-ad-box" style={outerStyle}>
        {visible && (
          <iframe
            ref={frameRef}
            title="Advertisement"
            srcDoc={srcDoc}
            sandbox={SANDBOX}
            scrolling="no"
            referrerPolicy="no-referrer-when-downgrade"
            style={
              fixed
                ? { width: fixed.w, height: fixed.h, transform: `scale(${scale})`, transformOrigin: '0 0', border: 0 }
                : { width: '100%', height: Math.max(autoH, 300), border: 0 }
            }
          />
        )}
      </div>
    </div>
  );
};

const AdBox: React.FC<{ ad: AdUnit; code: string; mode: string; className: string }> = ({ ad, code, mode, className }) => {
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  const fixed = mode === 'banner' ? parseAdSize(code, ad.dimensions) : null;

  if (ad.position === 'sticky_bottom') {
    return (
      <div className="cm-ad-sticky" role="complementary" aria-label="Advertisement">
        <button type="button" className="cm-ad-close" onClick={() => setClosed(true)} aria-label="Close ad">
          <X size={14} />
        </button>
        <AdFrame code={code} fixed={fixed} eager />
      </div>
    );
  }
  return (
    <div className={`cm-ad-slot ${className}`} data-ad-position={ad.position}>
      <AdFrame code={code} fixed={fixed} eager={false} />
    </div>
  );
};

export const AdSlot: React.FC<AdSlotProps> = ({ position, className = '' }) => {
  const version = useStoreVersion();
  const isMobile = useIsMobile();

  const resolved = useMemo(() => {
    const ad = storageService.getAds().find((a) => a.position === position && a.enabled);
    if (!ad) return null;
    if (ad.deviceTarget === 'mobile' && !isMobile) return null;
    if (ad.deviceTarget === 'desktop' && isMobile) return null;
    const code = isMobile && hasRunnableCode(ad.mobileCode) ? (ad.mobileCode as string) : ad.code;
    if (!hasRunnableCode(code)) return null;
    return { ad, code: code.trim() };
    // `version` changes when admin data is refreshed from the server
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, isMobile, version]);

  const mode = SLOT_BY_POSITION[position]?.mode ?? 'banner';

  // Social Bar runs on the page itself, once, async - no visible wrapper
  useEffect(() => {
    if (resolved && mode === 'global') adsterraService.mountGlobalScript(resolved.ad.id, resolved.code);
  }, [resolved, mode]);

  if (!resolved || mode === 'global' || mode === 'popunder') return null;
  return <AdBox key={`${resolved.ad.id}:${resolved.code.length}:${resolved.code.slice(0, 40)}`} ad={resolved.ad} code={resolved.code} mode={mode} className={className} />;
};
