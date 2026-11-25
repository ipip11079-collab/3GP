import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Camera,
  Eye,
  ExternalLink,
  Globe,
  Monitor,
  MonitorOff,
  OctagonAlert,
  ShieldCheck,
  Sparkles,
  Volume2,
} from 'lucide-react';
import {
  computeFrameDiffRatio,
  shouldAnalyzeNewFrame,
} from '../lib/quotexVision.ts';
import type {
  AssistantLanguage,
  QuotexVisionSignal,
} from '../types/trading.ts';
import {
  buildQuotexVisionPairSpeech,
  buildQuotexVisionSignalSpeech,
  speakText,
  stopSpeaking,
} from '../utils/voiceAssistant.ts';

interface QuotexVisualIntelligencePanelProps {
  platformUrl: string;
  language: AssistantLanguage;
  voiceEnabled: boolean;
  emergencyStopped: boolean;
  openBrowserSignal: number;
  onToggleEmergencyStop: () => void;
}

export function QuotexVisualIntelligencePanel({
  platformUrl,
  language,
  voiceEnabled,
  emergencyStopped,
  openBrowserSignal,
  onToggleEmergencyStop,
}: QuotexVisualIntelligencePanelProps) {
  const [inAppBrowserOpen, setInAppBrowserOpen] = useState<boolean>(false);
  const [showEmbeddedFrame, setShowEmbeddedFrame] = useState<boolean>(false);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [autoMonitorScreen, setAutoMonitorScreen] = useState<boolean>(true);
  const [lastDiffRatio, setLastDiffRatio] = useState<number>(0);
  const [visionSignal, setVisionSignal] = useState<QuotexVisionSignal | null>(null);
  const [visionError, setVisionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>(
    'Ready. Share your Quotex window or tab to start live chart reading.',
  );

  const sectionRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prevThumbPixelsRef = useRef<Uint8ClampedArray | null>(null);
  const lastAnalyzeTimeRef = useRef<number>(0);
  const isAnalyzingRef = useRef<boolean>(false);
  isAnalyzingRef.current = isAnalyzing;
  const lastPairAnnouncedRef = useRef<string>('');
  const lastSignalSignatureRef = useRef<string>('');
  const voiceRef = useRef<boolean>(voiceEnabled);
  voiceRef.current = voiceEnabled;
  const langRef = useRef<AssistantLanguage>(language);
  langRef.current = language;
  const emergencyRef = useRef<boolean>(emergencyStopped);
  emergencyRef.current = emergencyStopped;

  const stopScreenCapture = useCallback((reason?: string) => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          // Ignore track stop errors
        }
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    prevThumbPixelsRef.current = null;
    setIsSharing(false);
    setIsAnalyzing(false);
    if (reason) {
      setStatusMessage(reason);
    }
  }, []);

  // Open & scroll smoothly when triggered from AccountsAndRiskPanel
  useEffect(() => {
    if (openBrowserSignal > 0) {
      setInAppBrowserOpen(true);
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [openBrowserSignal]);

  // Emergency STOP ALL must immediately halt screen capture, analysis, and voice
  useEffect(() => {
    if (emergencyStopped) {
      stopScreenCapture('Emergency STOP All active — screen sharing & visual reading halted.');
      stopSpeaking();
    }
  }, [emergencyStopped, stopScreenCapture]);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      stopScreenCapture();
    };
  }, [stopScreenCapture]);

  const captureAndAnalyzeFrame = useCallback(async (forceManual: boolean = false) => {
    if (emergencyRef.current) {
      setVisionError('Emergency STOP All is active.');
      return;
    }
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      if (forceManual) {
        setVisionError('Video stream is still warming up. Wait 1 second and try again.');
      }
      return;
    }
    if (isAnalyzingRef.current) return;

    // 1. Check pixel delta on lightweight thumbnail so idle frames don't spam Vision API
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 96;
    thumbCanvas.height = 54;
    const thumbCtx = thumbCanvas.getContext('2d');
    let diffRatio = 1;
    if (thumbCtx) {
      thumbCtx.drawImage(video, 0, 0, 96, 54);
      const thumbData = thumbCtx.getImageData(0, 0, 96, 54).data;
      if (prevThumbPixelsRef.current) {
        diffRatio = computeFrameDiffRatio(prevThumbPixelsRef.current, thumbData);
      }
      setLastDiffRatio(diffRatio);

      const now = Date.now();
      if (
        !forceManual &&
        !shouldAnalyzeNewFrame({
          emergencyStopped: emergencyRef.current,
          isSharing: Boolean(streamRef.current),
          isAnalyzing: isAnalyzingRef.current,
          diffRatio,
          msSinceLastAnalyze: now - lastAnalyzeTimeRef.current,
        })
      ) {
        return;
      }
      prevThumbPixelsRef.current = new Uint8ClampedArray(thumbData);
    }

    // 2. Capture crisp JPEG frame (up to 1280px wide)
    const maxW = 1280;
    const scale = Math.min(1, maxW / video.videoWidth);
    const targetW = Math.max(320, Math.round(video.videoWidth * scale));
    const targetH = Math.max(180, Math.round(video.videoHeight * scale));

    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = targetW;
    captureCanvas.height = targetH;
    const ctx = captureCanvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, targetW, targetH);

    const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.82);

    setIsAnalyzing(true);
    setVisionError(null);
    lastAnalyzeTimeRef.current = Date.now();
    setStatusMessage('Analyzing visible Quotex candles, pair, timeframe & mode…');

    try {
      const res = await fetch('/api/vision/quotex-screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: dataUrl,
          mimeType: 'image/jpeg',
          language: langRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Visual analysis request failed.');
      }

      const nextSignal = data.signal as QuotexVisionSignal;
      setVisionSignal(nextSignal);
      setStatusMessage(
        nextSignal.isQuotexChartReadable
          ? `Read ${nextSignal.detectedPair} (${nextSignal.detectedTimeframe}) · ${nextSignal.detectedAccountMode} mode`
          : 'NO CLEAR SIGNAL — Share the visible Quotex candlestick chart cleanly.',
      );

      // Natural voice updates on pair change or new directional signal
      if (voiceRef.current && !emergencyRef.current) {
        const signalSig = `${nextSignal.detectedAccountMode}|${nextSignal.detectedPair}|${nextSignal.direction}|${nextSignal.confidence}|${nextSignal.recommendation}`;
        if (
          nextSignal.isQuotexChartReadable &&
          nextSignal.detectedPair !== 'UNKNOWN' &&
          nextSignal.detectedPair !== lastPairAnnouncedRef.current &&
          nextSignal.direction === 'NO_CLEAR_SIGNAL'
        ) {
          lastPairAnnouncedRef.current = nextSignal.detectedPair;
          speakText(
            buildQuotexVisionPairSpeech(
              nextSignal.detectedPair,
              nextSignal.detectedAccountMode,
              langRef.current,
            ),
            true,
            undefined,
            undefined,
            langRef.current,
          );
        } else if (signalSig !== lastSignalSignatureRef.current) {
          lastSignalSignatureRef.current = signalSig;
          if (nextSignal.detectedPair !== 'UNKNOWN') {
            lastPairAnnouncedRef.current = nextSignal.detectedPair;
          }
          speakText(
            buildQuotexVisionSignalSpeech(nextSignal, langRef.current),
            true,
            undefined,
            undefined,
            langRef.current,
          );
        }
      }
    } catch (err) {
      setVisionError(
        err instanceof Error
          ? err.message
          : 'Unable to read shared screen via Gemini Vision API.',
      );
      setStatusMessage('Visual analysis paused on error — see message below.');
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // Poll video frames every 2s while screen capture is active & auto-monitor is ON
  useEffect(() => {
    if (!isSharing || !autoMonitorScreen || emergencyStopped) return;
    const timer = window.setInterval(() => {
      void captureAndAnalyzeFrame(false);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [isSharing, autoMonitorScreen, emergencyStopped, captureAndAnalyzeFrame]);

  const handleStartScreenShare = async () => {
    if (emergencyStopped) {
      setVisionError('Emergency STOP All is active. Resume system controls first.');
      return;
    }
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getDisplayMedia !== 'function'
    ) {
      setVisionError(
        'Browser Screen Capture (getDisplayMedia) is not supported in this mobile browser or WebView. Use Chrome/Edge Desktop or an Android app with MediaProjection permission.',
      );
      return;
    }

    setVisionError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 2, max: 5 },
        },
        audio: false,
      });

      streamRef.current = stream;
      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        videoTrack.onended = () => {
          stopScreenCapture('Screen sharing ended by user.');
        };
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      setIsSharing(true);
      setStatusMessage('Screen capture active — capturing first Quotex frame…');
      window.setTimeout(() => {
        void captureAndAnalyzeFrame(true);
      }, 650);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Screen-sharing permission denied.';
      setVisionError(`Screen capture not started: ${msg}`);
    }
  };

  const handleSpeakLatestReading = () => {
    if (emergencyStopped) return;
    const text = visionSignal
      ? buildQuotexVisionSignalSpeech(visionSignal, language)
      : buildQuotexVisionPairSpeech('Quotex chart', 'UNKNOWN', language);
    speakText(text, true, undefined, undefined, language);
  };

  const modeBadge =
    visionSignal?.detectedAccountMode === 'LIVE'
      ? {
          label: 'LIVE ACCOUNT DETECTED',
          classes: 'border-rose-400/70 bg-rose-500/20 text-rose-100',
        }
      : visionSignal?.detectedAccountMode === 'DEMO'
        ? {
            label: 'DEMO ACCOUNT DETECTED',
            classes: 'border-sky-400/70 bg-sky-500/20 text-sky-100',
          }
        : {
            label: 'ACCOUNT MODE: NOT DETECTED',
            classes: 'border-slate-600 bg-slate-900 text-slate-300',
          };

  const directionColor =
    visionSignal?.direction === 'UP'
      ? 'text-emerald-400 border-emerald-400/70 bg-emerald-500/15'
      : visionSignal?.direction === 'DOWN'
        ? 'text-rose-400 border-rose-400/70 bg-rose-500/15'
        : 'text-amber-300 border-amber-400/60 bg-amber-500/10';

  const activeSpokenScript = visionSignal
    ? buildQuotexVisionSignalSpeech(visionSignal, language)
    : language === 'hi'
      ? 'इसरार भाई, क्वोटेक्स स्क्रीन शेयर करने पर मैं पेयर, डेमो/लाइव मोड और अगली कैंडल का विश्लेषण करूँगा।'
      : language === 'en'
        ? 'Israr Bhai, share your Quotex chart tab or screen to read pair, Demo/Live mode, and candle signals live.'
        : 'Israr Bhai, apni Quotex screen share karein — main selected pair, Demo/Live mode aur agali candle live analyze karunga.';

  return (
    <section
      ref={sectionRef}
      aria-label="ISRAR AI Live Quotex Visual Intelligence"
      data-testid="quotex-visual-intelligence-panel"
      className="neon-panel rounded-2xl p-4 sm:p-5 space-y-4"
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-500/20 pb-3">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <Eye className="h-5 w-5 text-cyan-300" aria-hidden="true" />
            <h2 className="font-display text-base font-extrabold tracking-wide text-white">
              ISRAR AI — LIVE QUOTEX VISUAL INTELLIGENCE
            </h2>
            <span
              className={`rounded border px-2 py-0.5 font-mono text-[10px] font-bold ${modeBadge.classes}`}
              data-testid="quotex-vision-account-mode"
            >
              {modeBadge.label}
            </span>
          </div>
          <p className="text-xs text-slate-300">
            Authorized screen-capture reader for Quotex Demo &amp; Live charts · Manual trade control only · No auto clicks
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setInAppBrowserOpen((v) => !v)}
            data-testid="toggle-inapp-quotex-browser-btn"
            aria-expanded={inAppBrowserOpen}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-cyan-400/70 bg-cyan-500/15 px-3 text-xs font-bold text-cyan-100 hover:bg-cyan-500/25 cursor-pointer whitespace-nowrap"
          >
            <Globe className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            <span>{inAppBrowserOpen ? 'Hide Quotex Browser' : 'Quotex In-App Browser'}</span>
          </button>

          <a
            href={platformUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="quotex-tab-link"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-sky-400/60 bg-[#061229] px-3 text-xs font-bold text-sky-100 hover:border-sky-300 whitespace-nowrap"
          >
            <ExternalLink className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
            <span>Open Quotex Tab</span>
          </a>

          {!isSharing ? (
            <button
              type="button"
              disabled={emergencyStopped}
              onClick={() => void handleStartScreenShare()}
              data-testid="share-quotex-screen-btn"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-emerald-400/80 bg-emerald-500/20 px-3.5 text-xs font-extrabold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-45 cursor-pointer whitespace-nowrap"
            >
              <Monitor className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              <span>Share Quotex Screen</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => stopScreenCapture('Screen sharing stopped by user.')}
              data-testid="stop-screen-share-btn"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-400/80 bg-rose-500/25 px-3.5 text-xs font-extrabold text-rose-100 hover:bg-rose-500/35 cursor-pointer whitespace-nowrap"
            >
              <MonitorOff className="h-4 w-4 text-rose-300" aria-hidden="true" />
              <span>Stop Sharing</span>
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Quotex In-App Browser Workspace */}
      {inAppBrowserOpen && (
        <div
          data-testid="quotex-inapp-browser-container"
          className="rounded-xl border border-cyan-500/40 bg-[#040B1A] p-3.5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-cyan-200 font-semibold">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
              <span>In-App Quotex Login Workspace (Manual Session · Zero Password Storage)</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowEmbeddedFrame((v) => !v)}
                data-testid="toggle-embedded-webview-btn"
                className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-600 bg-slate-900 px-2.5 text-[11px] font-semibold text-slate-200 hover:border-cyan-400 cursor-pointer"
              >
                <span>{showEmbeddedFrame ? 'Close WebView Frame' : 'Try Embedded WebView Frame'}</span>
              </button>
              <a
                href={platformUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-sky-400/70 bg-sky-500/20 px-3 text-[11px] font-bold text-sky-100 hover:bg-sky-500/30"
              >
                <span>Launch Quotex Login Tab</span>
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="rounded-lg border border-amber-400/35 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-100 leading-relaxed space-y-1">
            <div>
              <strong>Browser &amp; Android WebView Notice:</strong> qxbroker.com sets{' '}
              <code className="font-mono text-amber-200">X-Frame-Options: sameorigin</code>, which standard web browsers enforce by blocking cross-origin iframes. Full embedded browsing inside this screen requires an Android WebView APK or desktop wrapper.
            </div>
            <div className="text-amber-200/90">
              In web browsers: click <strong>Launch Quotex Login Tab</strong> above, sign in manually on Quotex (Demo or Live), then click <strong>Share Quotex Screen</strong> and select that tab.
            </div>
          </div>

          {showEmbeddedFrame && (
            <iframe
              src={platformUrl}
              title="Quotex Official Sign-In Workspace"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
              className="h-[360px] w-full rounded-xl border border-sky-500/30 bg-[#02050F]"
            />
          )}
        </div>
      )}

      {/* Main Two-Column Visual Intelligence Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Live Screen Capture Preview & Stream Controls */}
        <div className="lg:col-span-5 rounded-xl border border-sky-500/25 bg-[#040B19] p-3 flex flex-col justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono font-bold text-sky-300 uppercase">
                Live Screen Capture Feed
              </span>
              <span
                className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${
                  isSharing
                    ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200'
                    : 'border-slate-700 bg-slate-900 text-slate-400'
                }`}
              >
                {isSharing ? 'STREAMING' : 'STANDBY'}
              </span>
            </div>

            <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-sky-500/25 bg-[#020612] flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={`h-full w-full object-contain ${isSharing ? 'block' : 'hidden'}`}
              />
              {!isSharing && (
                <div className="px-4 text-center space-y-2">
                  <Monitor className="mx-auto h-8 w-8 text-sky-400/70" aria-hidden="true" />
                  <p className="text-xs text-slate-300">
                    Click <strong className="text-white">Share Quotex Screen</strong> and pick your open Quotex browser tab or window.
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Gmail OAuth does not grant Quotex screen access — explicit screen-share permission is required.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoMonitorScreen}
                  onChange={(e) => setAutoMonitorScreen(e.target.checked)}
                  className="h-3.5 w-3.5 accent-cyan-400"
                />
                <span>Auto-read when chart changes</span>
              </label>
              <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                Δ {(lastDiffRatio * 100).toFixed(1)}%
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!isSharing || isAnalyzing || emergencyStopped}
                onClick={() => void captureAndAnalyzeFrame(true)}
                data-testid="analyze-screen-now-btn"
                className="flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-sky-400/70 bg-sky-500/20 px-2.5 text-xs font-bold text-sky-100 hover:bg-sky-500/30 disabled:opacity-45 cursor-pointer"
              >
                <Camera className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
                <span>{isAnalyzing ? 'Reading…' : 'Analyze Screen Now'}</span>
              </button>

              <button
                type="button"
                disabled={emergencyStopped}
                onClick={handleSpeakLatestReading}
                data-testid="speak-quotex-reading-btn"
                className="flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-amber-400/60 bg-amber-500/15 px-2.5 text-xs font-bold text-amber-100 hover:bg-amber-500/25 disabled:opacity-45 cursor-pointer"
              >
                <Volume2 className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
                <span>Speak Reading</span>
              </button>
            </div>

            <div className="rounded-lg border border-sky-500/20 bg-[#050C1D] px-2.5 py-1.5 text-[11px] text-slate-300">
              {statusMessage}
            </div>
          </div>
        </div>

        {/* Right: Structured Visual Signal Output + Voice Preview */}
        <div className="lg:col-span-7 rounded-xl border border-sky-500/25 bg-[#040B19] p-3.5 flex flex-col justify-between gap-3">
          {visionError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose-500/60 bg-rose-950/50 px-3 py-2 text-xs text-rose-100"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
              <span>{visionError}</span>
            </div>
          )}

          {/* Top Metric Strip */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-sky-500/20 bg-[#050D21] p-2.5">
              <div className="text-[10px] font-mono text-slate-400 uppercase">Selected Pair</div>
              <div className="mt-0.5 font-mono text-sm font-extrabold text-white truncate">
                {visionSignal?.detectedPair && visionSignal.detectedPair !== 'UNKNOWN'
                  ? visionSignal.detectedPair
                  : 'NO CLEAR PAIR'}
              </div>
            </div>

            <div className="rounded-xl border border-sky-500/20 bg-[#050D21] p-2.5">
              <div className="text-[10px] font-mono text-slate-400 uppercase">Timeframe</div>
              <div className="mt-0.5 font-mono text-sm font-extrabold text-cyan-200">
                {visionSignal?.detectedTimeframe && visionSignal.detectedTimeframe !== 'UNKNOWN'
                  ? visionSignal.detectedTimeframe
                  : '--'}
              </div>
            </div>

            <div className={`rounded-xl border p-2.5 ${directionColor}`}>
              <div className="text-[10px] font-mono uppercase opacity-80">Signal Direction</div>
              <div className="mt-0.5 flex items-center gap-1 font-mono text-sm font-extrabold">
                {visionSignal?.direction === 'UP' && (
                  <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                {visionSignal?.direction === 'DOWN' && (
                  <ArrowDownRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span>
                  {visionSignal
                    ? visionSignal.direction === 'NO_CLEAR_SIGNAL'
                      ? 'NO CLEAR SIGNAL'
                      : visionSignal.direction
                    : 'NO CLEAR SIGNAL'}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-sky-500/20 bg-[#050D21] p-2.5">
              <div className="text-[10px] font-mono text-slate-400 uppercase">Confidence</div>
              <div className="mt-0.5 font-mono text-sm font-extrabold text-white tabular-nums">
                {visionSignal && visionSignal.confidence > 0 ? `${visionSignal.confidence}%` : '--%'}
              </div>
            </div>
          </div>

          {/* Visible Candlestick & Market Structure Breakdown */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
            <div className="rounded-xl border border-sky-500/20 bg-[#050D21] p-2.5 space-y-1">
              <div className="text-[10px] font-mono uppercase text-sky-300">
                Candle Body &amp; Wicks
              </div>
              <div className="text-slate-200">
                {visionSignal?.candleAnalysis.lastCandleDirection ?? 'UNKNOWN'} ·{' '}
                {visionSignal?.candleAnalysis.bodyStrength ?? 'Waiting for shared chart'}
              </div>
              <div className="text-[11px] text-slate-400">
                Wicks: {visionSignal?.candleAnalysis.wicksNote ?? 'Not yet analyzed'}
              </div>
            </div>

            <div className="rounded-xl border border-sky-500/20 bg-[#050D21] p-2.5 space-y-1">
              <div className="text-[10px] font-mono uppercase text-sky-300">
                Momentum &amp; S/R Levels
              </div>
              <div className="text-slate-200">
                {visionSignal?.candleAnalysis.momentum ?? 'Waiting for live screen read'}
              </div>
              <div className="text-[11px] text-slate-400">
                S/R: {visionSignal?.candleAnalysis.supportResistance ?? 'Not visible yet'}
              </div>
            </div>
          </div>

          {/* Short Explanation + Trade / No-Trade Recommendation */}
          <div className="rounded-xl border border-sky-500/25 bg-[#050D21] p-3 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase text-cyan-300">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Visual Chart Explanation</span>
              </span>
              <span
                className={`rounded border px-2 py-0.5 font-mono text-[10px] font-extrabold ${
                  visionSignal?.recommendation === 'TRADE'
                    ? 'border-emerald-400/70 bg-emerald-500/20 text-emerald-100'
                    : visionSignal?.recommendation === 'AVOID_TRADE'
                      ? 'border-rose-400/70 bg-rose-500/20 text-rose-100'
                      : 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                }`}
              >
                {visionSignal?.recommendation === 'TRADE'
                  ? 'MANUAL SETUP READY'
                  : visionSignal?.recommendation === 'AVOID_TRADE'
                    ? 'AVOID TRADE (RISK)'
                    : 'NO CLEAR SIGNAL'}
              </span>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">
              {visionSignal?.shortExplanation ??
                'Share your Quotex window or browser tab to read live candlesticks, direction, confidence, and support/resistance zones.'}
            </p>
          </div>

          {/* Natural Urdu / Hindi / English Voice Summary + Safety Control */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 rounded-xl border border-amber-400/30 bg-[#050C1D] px-3 py-2.5">
            <p className="text-xs text-amber-100 leading-snug" data-testid="quotex-vision-voice-preview">
              &ldquo;{activeSpokenScript}&rdquo;
            </p>
            <button
              type="button"
              onClick={onToggleEmergencyStop}
              data-testid="vision-emergency-stop-btn"
              className={`shrink-0 inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-xl border px-3 text-[11px] font-extrabold cursor-pointer whitespace-nowrap ${
                emergencyStopped
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
                  : 'border-rose-500/80 bg-rose-950/75 text-rose-100 hover:bg-rose-900/80'
              }`}
            >
              <OctagonAlert className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />
              <span>{emergencyStopped ? 'RESUME' : 'EMERGENCY STOP ALL'}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
