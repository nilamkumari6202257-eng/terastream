import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VideoItem } from '@/types/video';
import { storageService } from '@/services/storageService';
import {
  Share2,
  Copy,
  Check,
  QrCode,
  Code,
  Send,
  MessageCircle,
  Twitter,
  Facebook,
  Mail,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

interface ShareModalProps {
  video: VideoItem;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  video,
  isOpen,
  onOpenChange,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  // The actual website watch page URL
  const pageUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/watch/${video.slug || video.id}`
    : `/watch/${video.slug || video.id}`;

  const shareText = `Watch "${video.title}" in HD on ${storageService.getSettings().siteName || 'TeraStream'}!`;

  // Pre-generate QR Code
  useEffect(() => {
    if (isOpen && pageUrl) {
      QRCode.toDataURL(pageUrl, {
        width: 250,
        margin: 2,
        color: {
          dark: '#ffffff',
          light: '#1e1b4b',
        },
      })
        .then((url) => setQrCodeUrl(url))
        .catch((err) => console.error('Failed generating QR code', err));
    }
  }, [isOpen, pageUrl]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(pageUrl);
    setCopiedLink(true);
    toast.success('Video page link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const embedSnippet = `<iframe src="${pageUrl}" width="100%" height="480" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;

  const handleCopyEmbed = () => {
    navigator.clipboard.writeText(embedSnippet);
    setCopiedEmbed(true);
    toast.success('Embed iframe code copied!');
    setTimeout(() => setCopiedEmbed(false), 2500);
  };

  const socialLinks = [
    {
      name: 'WhatsApp',
      icon: MessageCircle,
      color: 'bg-emerald-600 hover:bg-emerald-500',
      href: `https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareText}\n${pageUrl}`)}`,
    },
    {
      name: 'Telegram',
      icon: Send,
      color: 'bg-sky-500 hover:bg-sky-400',
      href: `https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(shareText)}`,
    },
    {
      name: 'Twitter / X',
      icon: Twitter,
      color: 'bg-neutral-800 hover:bg-neutral-700',
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(pageUrl)}`,
    },
    {
      name: 'Facebook',
      icon: Facebook,
      color: 'bg-blue-600 hover:bg-blue-500',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`,
    },
    {
      name: 'Email',
      icon: Mail,
      color: 'bg-purple-600 hover:bg-purple-500',
      href: `mailto:?subject=${encodeURIComponent(video.title)}&body=${encodeURIComponent(`${shareText}\n\n${pageUrl}`)}`,
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-xl bg-card border-border text-foreground p-5 md:p-6 rounded-3xl">
        <DialogHeader className="text-left pb-2 border-b border-border">
          <DialogTitle className="text-lg md:text-xl font-bold flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            Share This Video Page
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Share this cinematic streaming page with friends across social media or embed it on your own blog.
          </DialogDescription>
        </DialogHeader>

        {/* Video Card Preview */}
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-muted/50 border border-white/5 my-2">
          <img
            src={video.thumbnail}
            alt={video.title}
            className="h-16 w-24 object-cover rounded-xl border border-white/10 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold truncate text-foreground">{video.title}</h4>
            <p className="text-xs text-muted-foreground line-clamp-1">{video.description || 'TeraBox High-Definition Stream'}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary-foreground font-medium">
                {video.category.toUpperCase()}
              </span>
              <span className="text-[11px] text-muted-foreground">{video.views.toLocaleString()} views</span>
            </div>
          </div>
        </div>

        <Tabs defaultValue="social" className="w-full">
          <TabsList className="grid grid-cols-3 mb-4 bg-muted">
            <TabsTrigger value="social" className="text-xs">Social Share</TabsTrigger>
            <TabsTrigger value="qr" className="text-xs">Scan QR Code</TabsTrigger>
            <TabsTrigger value="embed" className="text-xs">Embed Player</TabsTrigger>
          </TabsList>

          {/* Social Share Tab */}
          <TabsContent value="social" className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-foreground/80 mb-1.5 block">
                Direct Page Link
              </label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={pageUrl}
                  className="bg-background font-mono text-xs text-foreground px-3 select-all"
                />
                <Button
                  onClick={handleCopyLink}
                  className="shrink-0 bg-primary hover:bg-primary/90 text-white text-xs h-10 px-4 font-semibold"
                >
                  {copiedLink ? (
                    <>
                      <Check className="h-4 w-4 mr-1.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-1.5" /> Copy Link
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground/80 mb-2 block">
                Share to Apps & Networks
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {socialLinks.map((s) => {
                  const Icon = s.icon;
                  return (
                    <a
                      key={s.name}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-white text-xs font-semibold transition-transform hover:scale-[1.02] active:scale-95 shadow-md ${s.color}`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{s.name}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* QR Code Tab */}
          <TabsContent value="qr" className="flex flex-col items-center justify-center py-2 space-y-3">
            {qrCodeUrl ? (
              <div className="p-3 bg-white/5 border border-white/10 rounded-2xl shadow-xl flex flex-col items-center">
                <img
                  src={qrCodeUrl}
                  alt="Scan to watch video"
                  className="w-48 h-48 rounded-xl"
                />
                <p className="text-[11px] text-muted-foreground mt-2 text-center">
                  Scan with your phone camera to open and stream instantly
                </p>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
                Generating QR code...
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="text-xs border-border"
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy Link Instead
            </Button>
          </TabsContent>

          {/* Embed Code Tab */}
          <TabsContent value="embed" className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-foreground/80 mb-1.5 block">
                Iframe Embed Code Snippet
              </label>
              <Textarea
                readOnly
                value={embedSnippet}
                rows={3}
                className="bg-background font-mono text-xs text-foreground px-3 resize-none select-all"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                Paste into your blog, forum, or website HTML.
              </span>
              <Button
                onClick={handleCopyEmbed}
                className="bg-primary hover:bg-primary/90 text-white text-xs h-9 px-4 font-semibold"
              >
                {copiedEmbed ? (
                  <>
                    <Check className="h-3.5 w-3.5 mr-1.5" /> Copied
                  </>
                ) : (
                  <>
                    <Code className="h-3.5 w-3.5 mr-1.5" /> Copy Embed Code
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
