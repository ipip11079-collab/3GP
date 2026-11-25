import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccountsAndRiskPanel } from './components/AccountsAndRiskPanel.tsx';
import { AccuracyPanel } from './components/AccuracyPanel.tsx';
import { ActionRail } from './components/ActionRail.tsx';
import { AiAgentTelemetry } from './components/AiAgentTelemetry.tsx';
import { AutoSignalBoard } from './components/AutoSignalBoard.tsx';
import { BirthdayCelebrationBanner } from './components/BirthdayCelebrationBanner.tsx';
import { CandleChartPanel } from './components/CandleChartPanel.tsx';
import { HeaderBar } from './components/HeaderBar.tsx';
import { HistoryModal } from './components/HistoryModal.tsx';
import { LearningAndVoicePanel } from './components/LearningAndVoicePanel.tsx';
import { LiveScreenerPanel } from './components/LiveScreenerPanel.tsx';
import { MarketControls } from './components/MarketControls.tsx';
import { OwnerSettingsModal } from './components/OwnerSettingsModal.tsx';
import { QuotexVisualIntelligencePanel } from './components/QuotexVisualIntelligencePanel.tsx';
import { SignalStage, type LoadingStepState } from './components/SignalStage.tsx';
import { StatsModal } from './components/StatsModal.tsx';
import {
  getGoogleAccessToken,
  initGoogleAuth,
  signInWithGoogleGmail,
  signOutGoogleGmail,
} from './lib/googleAuth.ts';
import {
  getPairById,
  getPairsForMarket,
  getTimeframeSeconds,
  supportsSubMinute,
  TRADING_PAIRS,
} from './lib/pairs.ts';
import { shouldTriggerBotAutoTrade } from './lib/risk.ts';
import type {
  AccountsSnapshot,
  AssistantLanguage,
  AutoBoardResponse,
  Candle,
  ChartOverlayData,
  GmailQuotexVerification,
  LearningProfile,
  LiveMonitorTick,
  MarketMode,
  OverallAccuracyReport,
  OwnerSettings,
  PredictionResult,
  QuotexReadinessProfile,
  RecordedPrediction,
  ScreenerRow,
  Timeframe,
  TradingPair,
} from './types/trading.ts';
import {
  buildPairSelectedSpeech,
  buildPredictionSpeech,
  speakText,
  stopSpeaking,
} from './utils/voiceAssistant.ts';

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export default function App() {
  const [ownerSettings, setOwnerSettings] = useState<OwnerSettings | null>(null);
  const [ownerToken, setOwnerToken] = useState<string | null>(null);
  const [ownerModalOpen, setOwnerModalOpen] = useState<boolean>(false);

  const [market, setMarket] = useState<MarketMode>('OTC');
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');
  const availablePairs = useMemo(() => getPairsForMarket(market), [market]);
  const [selectedPair, setSelectedPair] = useState<TradingPair>(
    () => TRADING_PAIRS.find((p) => p.id === 'BTC-USD') ?? TRADING_PAIRS[0],
  );

  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(false);
  const [assistantLanguage, setAssistantLanguage] = useState<AssistantLanguage>('en');
  const [autoAgentEnabled, setAutoAgentEnabled] = useState<boolean>(true);
  const [autoBoardEnabled, setAutoBoardEnabled] = useState<boolean>(true);
  const [autoPairSwitch, setAutoPairSwitch] = useState<boolean>(true);
  const [autoTradingEnabled, setAutoTradingEnabled] = useState<boolean>(false);
  const [tradingSessionActive, setTradingSessionActive] = useState<boolean>(false);
  const [birthdayTheme, setBirthdayTheme] = useState<boolean>(true);
  const [botStatusNotice, setBotStatusNotice] = useState<string | null>(null);
  const [emergencyStopped, setEmergencyStopped] = useState<boolean>(false);
  const [autoSelectedNotice, setAutoSelectedNotice] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);
  const [googleUserName, setGoogleUserName] = useState<string | null>(null);
  const [googleTokenReady, setGoogleTokenReady] = useState<boolean>(false);
  const [gmailBusy, setGmailBusy] = useState<boolean>(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [gmailVerification, setGmailVerification] = useState<GmailQuotexVerification | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [loadingState, setLoadingState] = useState<LoadingStepState | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveQuotePrice, setLiveQuotePrice] = useState<number | null>(null);
  const [liveMonitor, setLiveMonitor] = useState<LiveMonitorTick | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [chartOverlay, setChartOverlay] = useState<ChartOverlayData | null>(null);
  const [feedSource, setFeedSource] = useState<string | null>(null);
  const [liveTelemetry, setLiveTelemetry] = useState<{
    technicalSummary: PredictionResult['technicalSummary'];
    smc?: PredictionResult['smc'] | null;
    multiTimeframe?: PredictionResult['multiTimeframe'] | null;
  } | null>(null);

  const [screenerRows, setScreenerRows] = useState<ScreenerRow[]>([]);
  const [screenerLoading, setScreenerLoading] = useState<boolean>(false);
  const [screenerError, setScreenerError] = useState<string | null>(null);

  const [autoBoardData, setAutoBoardData] = useState<AutoBoardResponse | null>(null);
  const [autoBoardLoading, setAutoBoardLoading] = useState<boolean>(false);
  const [autoBoardError, setAutoBoardError] = useState<string | null>(null);

  const [records, setRecords] = useState<RecordedPrediction[]>([]);
  const [accuracy, setAccuracy] = useState<OverallAccuracyReport | null>(null);
  const [learningProfile, setLearningProfile] = useState<LearningProfile | null>(null);
  const [accountsSnapshot, setAccountsSnapshot] = useState<AccountsSnapshot | null>(null);
  const [isSettling, setIsSettling] = useState<boolean>(false);

  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  const [statsOpen, setStatsOpen] = useState<boolean>(false);
  const [openQuotexBrowserNonce, setOpenQuotexBrowserNonce] = useState<number>(0);

  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<number>(0);
  const settleTimerRef = useRef<number | null>(null);
  const autoNextTimerRef = useRef<number | null>(null);
  const autoBoardTimerRef = useRef<number | null>(null);
  const voiceRef = useRef<boolean>(voiceEnabled);
  voiceRef.current = voiceEnabled;
  const langRef = useRef<AssistantLanguage>(assistantLanguage);
  langRef.current = assistantLanguage;
  const autoAgentRef = useRef<boolean>(autoAgentEnabled);
  autoAgentRef.current = autoAgentEnabled;
  const autoBoardRef = useRef<boolean>(autoBoardEnabled);
  autoBoardRef.current = autoBoardEnabled;
  const autoPairSwitchRef = useRef<boolean>(autoPairSwitch);
  autoPairSwitchRef.current = autoPairSwitch;
  const emergencyStopRef = useRef<boolean>(emergencyStopped);
  emergencyStopRef.current = emergencyStopped;
  const selectedPairRef = useRef<TradingPair>(selectedPair);
  selectedPairRef.current = selectedPair;
  const predictionRef = useRef<PredictionResult | null>(prediction);
  predictionRef.current = prediction;
  const manualOverrideUntilRef = useRef<number>(0);
  const lastAutoTradedCandleRef = useRef<string | null>(null);

  const fetchVerificationLedger = useCallback(async () => {
    try {
      const [predRes, learnRes] = await Promise.all([
        fetch('/api/predictions'),
        fetch('/api/learning'),
      ]);
      if (predRes.ok) {
        const data = (await predRes.json()) as {
          records: RecordedPrediction[];
          accuracy: OverallAccuracyReport;
        };
        setRecords(data.records);
        setAccuracy(data.accuracy);
      }
      if (learnRes.ok) {
        const lData = (await learnRes.json()) as { profile: LearningProfile };
        setLearningProfile(lData.profile);
      }
    } catch {
      // Ignore silent background sync error
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts');
      if (!res.ok) return;
      const data = (await res.json()) as AccountsSnapshot;
      setAccountsSnapshot(data);
    } catch {
      // Ignore silent error
    }
  }, []);

  const fetchScreener = useCallback(async (m: MarketMode, tf: Timeframe) => {
    setScreenerLoading(true);
    try {
      const res = await fetch(`/api/screener?market=${m}&timeframe=${tf}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load live market screening.');
      }
      setScreenerRows(Array.isArray(data.rows) ? (data.rows as ScreenerRow[]) : []);
      setScreenerError(null);
    } catch (err) {
      setScreenerError(
        err instanceof Error ? err.message : 'Unable to fetch market screener.',
      );
    } finally {
      setScreenerLoading(false);
    }
  }, []);

  const fetchAutoBoard = useCallback(async (m: MarketMode, force: boolean = false): Promise<AutoBoardResponse | null> => {
    setAutoBoardLoading(true);
    try {
      const res = await fetch(`/api/auto-board?market=${m}${force ? '&force=1' : ''}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load 1m Auto Signal Board.');
      }
      const typed = data as AutoBoardResponse;
      setAutoBoardData(typed);
      setAutoBoardError(null);
      return typed;
    } catch (err) {
      setAutoBoardError(
        err instanceof Error ? err.message : 'Unable to reach 1m Auto Signal Board.',
      );
      return null;
    } finally {
      setAutoBoardLoading(false);
    }
  }, []);

  const settleExpired = useCallback(async () => {
    setIsSettling(true);
    try {
      const res = await fetch('/api/predictions/settle', { method: 'POST' });
      if (!res.ok) return;
      const data = (await res.json()) as {
        records: RecordedPrediction[];
        accuracy: OverallAccuracyReport;
      };
      setRecords(data.records);
      setAccuracy(data.accuracy);
      void fetchVerificationLedger();
      void fetchAccounts();
    } finally {
      setIsSettling(false);
    }
  }, [fetchAccounts, fetchVerificationLedger]);

  const fetchQuote = useCallback(
    async (m: MarketMode, p: TradingPair, tf: Timeframe, signal?: AbortSignal) => {
      const res = await fetch(
        `/api/market/quote?market=${m}&pairId=${encodeURIComponent(p.id)}&timeframe=${tf}`,
        { signal },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reach market data feed.');
      }
      setLiveQuotePrice(typeof data.price === 'number' ? data.price : null);
      if (Array.isArray(data.candles)) {
        setCandles(data.candles as Candle[]);
      }
      if (data.chartOverlay) {
        setChartOverlay(data.chartOverlay as ChartOverlayData);
      }
      if (typeof data.feedSource === 'string') {
        setFeedSource(data.feedSource);
      }
      if (data.technicalSummary) {
        setLiveTelemetry({
          technicalSummary: data.technicalSummary as PredictionResult['technicalSummary'],
          smc: (data.smc as PredictionResult['smc'] | undefined) ?? null,
          multiTimeframe:
            (data.multiTimeframe as PredictionResult['multiTimeframe'] | undefined) ?? null,
        });
      }
      return data as {
        price: number;
        msUntilClose: number;
        dataSufficient: boolean;
      };
    },
    [],
  );

  const runAnalysis = useCallback(
    async (targetMarket: MarketMode, targetPair: TradingPair, targetTf: Timeframe) => {
      if (emergencyStopRef.current) return;

      abortRef.current?.abort();
      if (autoNextTimerRef.current) {
        window.clearTimeout(autoNextTimerRef.current);
        autoNextTimerRef.current = null;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      const currentRunId = ++runIdRef.current;

      setIsAnalyzing(true);
      setErrorMessage(null);
      const prev = predictionRef.current;
      if (
        !prev ||
        prev.pairId !== targetPair.id ||
        prev.market !== targetMarket ||
        prev.timeframe !== targetTf
      ) {
        setPrediction(null);
        setCandles([]);
        setChartOverlay(null);
        setLiveTelemetry(null);
        setLiveQuotePrice(null);
      }
      setLoadingState({
        stepIndex: 0,
        label: 'Connecting to genuine live market feed',
        waitMsRemaining: 0,
      });

      try {
        const quote = await fetchQuote(
          targetMarket,
          targetPair,
          targetTf,
          controller.signal,
        );
        if (runIdRef.current !== currentRunId || emergencyStopRef.current) return;

        setLoadingState({
          stepIndex: 1,
          label: 'Retrieving real-time price, candles & liquidity',
          waitMsRemaining: quote.msUntilClose <= 4500 ? quote.msUntilClose : 0,
        });
        await sleep(380, controller.signal);
        if (runIdRef.current !== currentRunId || emergencyStopRef.current) return;

        setLoadingState({
          stepIndex: 2,
          label: 'Analyzing 18-method SMC, EMA 9/21/50 & momentum',
          waitMsRemaining: quote.msUntilClose <= 4500 ? quote.msUntilClose : 0,
        });
        await sleep(380, controller.signal);
        if (runIdRef.current !== currentRunId || emergencyStopRef.current) return;

        const syncWaitMs =
          quote.msUntilClose > 300 && quote.msUntilClose <= 4500
            ? Math.min(quote.msUntilClose, 3600)
            : 400;

        setLoadingState({
          stepIndex: 3,
          label: 'Awaiting candle-close confirmation',
          waitMsRemaining: syncWaitMs,
        });
        await sleep(syncWaitMs, controller.signal);
        if (runIdRef.current !== currentRunId || emergencyStopRef.current) return;

        setLoadingState({
          stepIndex: 4,
          label: '3GP ISRAR AI Master synthesizing trade direction',
          waitMsRemaining: 0,
        });

        const res = await fetch('/api/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            market: targetMarket,
            pairId: targetPair.id,
            timeframe: targetTf,
          }),
          signal: controller.signal,
        });

        const payload = await res.json();
        if (!res.ok) {
          throw new Error(
            payload.error || 'Prediction analysis failed due to upstream error.',
          );
        }
        if (runIdRef.current !== currentRunId || emergencyStopRef.current) return;

        const nextPrediction = payload.prediction as PredictionResult;
        setPrediction(nextPrediction);
        setLiveQuotePrice(nextPrediction.entryPrice);
        if (Array.isArray(nextPrediction.candles)) {
          setCandles(nextPrediction.candles);
        }
        if (nextPrediction.chartOverlay) {
          setChartOverlay(nextPrediction.chartOverlay);
        }
        setFeedSource(nextPrediction.feedSource);
        if (payload.accuracy) {
          setAccuracy(payload.accuracy as OverallAccuracyReport);
        }
        if (payload.learningProfile) {
          setLearningProfile(payload.learningProfile as LearningProfile);
        }

        void fetchVerificationLedger();

        if (voiceRef.current) {
          speakText(
            buildPredictionSpeech(
              nextPrediction.direction,
              nextPrediction.confidence,
              langRef.current,
            ),
            true,
            () => setIsSpeaking(true),
            () => setIsSpeaking(false),
            langRef.current,
          );
        }

        if (settleTimerRef.current) {
          window.clearTimeout(settleTimerRef.current);
        }
        if (nextPrediction.recordedForVerification) {
          const msUntilSettle = Math.max(
            2000,
            nextPrediction.expiryTime - Date.now() + 2400,
          );
          settleTimerRef.current = window.setTimeout(() => {
            void settleExpired();
          }, msUntilSettle);
        }

        if (autoAgentRef.current && !emergencyStopRef.current) {
          const bucketMs = getTimeframeSeconds(targetTf) * 1000;
          const nowTs = Date.now();
          let msUntilBoundary = bucketMs - (nowTs % bucketMs) + 1200;
          if (msUntilBoundary < 12000 && targetTf === '1m') {
            msUntilBoundary += bucketMs;
          }
          autoNextTimerRef.current = window.setTimeout(() => {
            if (autoAgentRef.current && !emergencyStopRef.current) {
              void runAnalysis(targetMarket, targetPair, targetTf);
            }
          }, Math.max(5000, msUntilBoundary));
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        setPrediction(null);
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Unable to reach market or AI service.',
        );
      } finally {
        if (runIdRef.current === currentRunId) {
          setIsAnalyzing(false);
          setLoadingState(null);
        }
      }
    },
    [fetchQuote, fetchVerificationLedger, settleExpired],
  );

  // Initial mount: restore persistent Owner Settings from SQLite, load ledger, accounts, screener, board
  useEffect(() => {
    let active = true;

    const init = async () => {
      let initialMarket: MarketMode = 'OTC';
      let initialTf: Timeframe = '1m';
      let initialPair = TRADING_PAIRS.find((p) => p.id === 'BTC-USD') ?? TRADING_PAIRS[0];
      let stopped = false;

      try {
        const sRes = await fetch('/api/settings');
        if (sRes.ok) {
          const sData = (await sRes.json()) as { settings: OwnerSettings };
          const s = sData.settings;
          if (active && s) {
            setOwnerSettings(s);
            setMarket(s.primaryMarket);
            setTimeframe(s.primaryTimeframe);
            const restoredPair = getPairById(s.defaultPairId);
            if (restoredPair) {
              setSelectedPair(restoredPair);
              initialPair = restoredPair;
            }
            setAutoAgentEnabled(s.autoAgentEnabled);
            setAutoBoardEnabled(s.autoBoardEnabled);
            setAutoPairSwitch(s.autoPairSwitch);
            setAutoTradingEnabled(Boolean(s.autoTradingEnabled));
            setBirthdayTheme(s.birthdayTheme ?? true);
            setVoiceEnabled(s.voiceEnabled);
            setAssistantLanguage(s.assistantLanguage);
            setEmergencyStopped(s.emergencyStopped);
            initialMarket = s.primaryMarket;
            initialTf = s.primaryTimeframe;
            stopped = s.emergencyStopped;
          }
        }
      } catch {
        // Use safe defaults
      }

      if (!active) return;
      void fetchVerificationLedger();
      void fetchAccounts();
      void fetchScreener(initialMarket, initialTf);

      if (!stopped) {
        let targetPair = initialPair;
        let targetTf = initialTf;

        const board = await fetchAutoBoard(initialMarket);
        if (!active || emergencyStopRef.current) return;

        if (
          board &&
          autoPairSwitchRef.current &&
          Date.now() > manualOverrideUntilRef.current
        ) {
          const best = board.signals.find((s) => s.direction === 'UP' || s.direction === 'DOWN');
          if (best && best.pairId !== selectedPairRef.current.id) {
            const bestPair = getPairById(best.pairId);
            if (bestPair) {
              targetPair = bestPair;
              targetTf = '1m';
              setSelectedPair(bestPair);
              setTimeframe('1m');
              setAutoSelectedNotice(`Auto-Picked #1 (${best.direction} ${best.confidence}%)`);
            }
          }
        }

        void runAnalysis(initialMarket, targetPair, targetTf);
      }
    };

    void init();

    return () => {
      active = false;
      abortRef.current?.abort();
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
      if (autoNextTimerRef.current) window.clearTimeout(autoNextTimerRef.current);
      if (autoBoardTimerRef.current) window.clearTimeout(autoBoardTimerRef.current);
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1-Second Live Monitor polling (every 1000ms unless Emergency STOP is active)
  useEffect(() => {
    if (emergencyStopped) return;
    let cancelled = false;

    const poll1s = async () => {
      try {
        const res = await fetch(
          `/api/monitor/1s?market=${market}&pairId=${encodeURIComponent(selectedPair.id)}&timeframe=${timeframe}`,
        );
        if (!res.ok || cancelled) return;
        const tick = (await res.json()) as LiveMonitorTick;
        if (cancelled) return;
        setLiveMonitor(tick);
        if (tick.price !== null) {
          setLiveQuotePrice(tick.price);
        }
      } catch {
        if (!cancelled) {
          setLiveMonitor((prev) =>
            prev
              ? { ...prev, dataStatus: 'DATA_DISCONNECTED', errorReason: 'Monitor unreachable' }
              : null,
          );
        }
      }
    };

    void poll1s();
    const id = window.setInterval(() => {
      void poll1s();
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [market, selectedPair.id, timeframe, emergencyStopped]);

  // Sync Auto Signal Board strictly to each 1-minute candle close boundary (:01.4s after :00)
  useEffect(() => {
    if (!autoBoardEnabled || emergencyStopped) {
      if (autoBoardTimerRef.current) {
        window.clearTimeout(autoBoardTimerRef.current);
        autoBoardTimerRef.current = null;
      }
      return;
    }

    const scheduleNext1mClose = () => {
      const nowTs = Date.now();
      const msUntilNext1m = 60_000 - (nowTs % 60_000) + 1400;
      autoBoardTimerRef.current = window.setTimeout(() => {
        if (autoBoardRef.current && !emergencyStopRef.current) {
          void fetchAutoBoard(market).then((board) => {
            if (
              board &&
              autoPairSwitchRef.current &&
              !emergencyStopRef.current &&
              Date.now() > manualOverrideUntilRef.current
            ) {
              const best = board.signals.find(
                (s) => s.direction === 'UP' || s.direction === 'DOWN',
              );
              if (best) {
                const bestPair = getPairById(best.pairId);
                if (bestPair) {
                  setSelectedPair(bestPair);
                  setTimeframe('1m');
                  setAutoSelectedNotice(`Auto-Picked #1 (${best.direction} ${best.confidence}%)`);
                  void runAnalysis(market, bestPair, '1m');
                }
              }
            }
          });
          scheduleNext1mClose();
        }
      }, msUntilNext1m);
    };

    scheduleNext1mClose();
    return () => {
      if (autoBoardTimerRef.current) {
        window.clearTimeout(autoBoardTimerRef.current);
        autoBoardTimerRef.current = null;
      }
    };
  }, [autoBoardEnabled, emergencyStopped, market, fetchAutoBoard, runAnalysis]);

  // Poll Live Market Screening every 6 seconds (unless emergency stopped)
  useEffect(() => {
    if (emergencyStopped) return;
    const id = window.setInterval(() => {
      void fetchScreener(market, timeframe);
    }, 6000);
    return () => window.clearInterval(id);
  }, [market, timeframe, emergencyStopped, fetchScreener]);

  // Periodic background settlement check for pending predictions & demo trades
  useEffect(() => {
    const interval = window.setInterval(() => {
      const hasExpiredPred = records.some(
        (r) => r.outcome === 'PENDING' && Date.now() >= r.expiryTime + 2000,
      );
      const hasExpiredDemo = accountsSnapshot?.demoTrades.some(
        (t) => t.outcome === 'PENDING' && Date.now() >= t.expiryTime + 2000,
      );
      if (hasExpiredPred || hasExpiredDemo) {
        void settleExpired();
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [records, accountsSnapshot, settleExpired]);

  // Sync "Sam's Birthday Crazy Look" theme attribute on document.body
  useEffect(() => {
    document.body.dataset.theme = birthdayTheme ? 'sams-birthday' : 'classic';
  }, [birthdayTheme]);

  // Subscribe to Firebase Google OAuth session (strictly in-memory access token)
  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user, accessToken) => {
        setGoogleUserEmail(user.email ?? null);
        setGoogleUserName(user.displayName ?? null);
        setGoogleTokenReady(Boolean(accessToken));
      },
      () => {
        setGoogleUserEmail(null);
        setGoogleUserName(null);
        setGoogleTokenReady(false);
      },
    );
    return () => unsubscribe();
  }, []);

  // 3GP.bot Auto-Trading Execution on Confirmed Directional Signals (Demo $10k Paper Mode Only)
  useEffect(() => {
    if (!prediction) return;
    const threshold = ownerSettings?.confidenceThreshold ?? 58;
    const candleKey = `${prediction.market}:${prediction.pairId}:${prediction.timeframe}:${prediction.candleOpenTime}`;
    const shouldTrade = shouldTriggerBotAutoTrade({
      autoTradingEnabled,
      tradingSessionActive,
      emergencyStopped,
      direction: prediction.direction,
      confidence: prediction.confidence,
      confidenceThreshold: threshold,
      candleKey,
      alreadyTradedKey: lastAutoTradedCandleRef.current,
    });
    if (!shouldTrade) return;

    lastAutoTradedCandleRef.current = candleKey;
    const stake = ownerSettings?.demoStakeAmount ?? 25;

    void (async () => {
      try {
        const res = await fetch('/api/accounts/demo/trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pairId: prediction.pairId,
            market: prediction.market,
            timeframe: prediction.timeframe,
            direction: prediction.direction,
            stake,
            source: '3GP_BOT_AUTO',
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setAccountsSnapshot({
            demo: data.demo,
            demoTrades: data.demoTrades,
            live: data.live,
            quotex: data.quotex,
            quotexProfile: data.quotexProfile,
          });
          setBotStatusNotice(
            `3GP.bot placed Demo ${prediction.direction} ($${stake}) on ${prediction.pairSymbol} (${prediction.confidence}% conf).`,
          );
        } else if (res.status === 409) {
          setBotStatusNotice(`3GP.bot candle guard: already placed trade for ${prediction.pairSymbol}.`);
        } else {
          setBotStatusNotice(data.error ?? '3GP.bot skipped trade.');
        }
      } catch {
        setBotStatusNotice('3GP.bot encountered network error placing demo trade.');
      }
    })();
  }, [prediction, autoTradingEnabled, tradingSessionActive, emergencyStopped, ownerSettings]);

  const handleToggleEmergencyStop = async () => {
    const nextStopped = !emergencyStopped;
    setEmergencyStopped(nextStopped);
    if (nextStopped) {
      setTradingSessionActive(false);
      abortRef.current?.abort();
      if (autoNextTimerRef.current) {
        window.clearTimeout(autoNextTimerRef.current);
        autoNextTimerRef.current = null;
      }
      if (autoBoardTimerRef.current) {
        window.clearTimeout(autoBoardTimerRef.current);
        autoBoardTimerRef.current = null;
      }
      stopSpeaking();
      setIsSpeaking(false);
      setIsAnalyzing(false);
      setLoadingState(null);
    }
    try {
      const res = await fetch('/api/settings/emergency-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stopped: nextStopped }),
      });
      if (res.ok) {
        const data = (await res.json()) as { settings: OwnerSettings };
        setOwnerSettings(data.settings);
      }
    } catch {
      // UI state already enforced safely
    }
  };

  const handleClaimPasscode = async (passcode: string) => {
    try {
      const res = await fetch('/api/settings/claim-owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error };
      setOwnerSettings(data.settings as OwnerSettings);
      setOwnerToken(String(data.token));
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error claiming owner passcode.' };
    }
  };

  const handleUnlockOwner = async (passcode: string) => {
    try {
      const res = await fetch('/api/settings/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error };
      setOwnerSettings(data.settings as OwnerSettings);
      setOwnerToken(String(data.token));
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error verifying passcode.' };
    }
  };

  const handleSaveOwnerSettings = async (patch: Partial<OwnerSettings>) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (ownerToken) {
        headers.Authorization = `Bearer ${ownerToken}`;
      }
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error };
      const saved = data.settings as OwnerSettings;
      setOwnerSettings(saved);
      setMarket(saved.primaryMarket);
      setTimeframe(saved.primaryTimeframe);
      const nextPair = getPairById(saved.defaultPairId);
      if (nextPair) setSelectedPair(nextPair);
      setAutoAgentEnabled(saved.autoAgentEnabled);
      setAutoBoardEnabled(saved.autoBoardEnabled);
      setAutoPairSwitch(saved.autoPairSwitch);
      setAutoTradingEnabled(Boolean(saved.autoTradingEnabled));
      setBirthdayTheme(saved.birthdayTheme ?? true);
      setVoiceEnabled(saved.voiceEnabled);
      setAssistantLanguage(saved.assistantLanguage);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Failed to persist owner settings.' };
    }
  };

  const persistRuntimeMode = async (patch: {
    autoTradingEnabled?: boolean;
    birthdayTheme?: boolean;
  }) => {
    try {
      const res = await fetch('/api/settings/runtime-modes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = (await res.json()) as { settings: OwnerSettings };
        setOwnerSettings(data.settings);
      }
    } catch {
      // Ignore transient network failure
    }
  };

  const handleToggleAutoTrading = () => {
    const next = !autoTradingEnabled;
    setAutoTradingEnabled(next);
    if (!next) {
      setTradingSessionActive(false);
      setBotStatusNotice('3GP.bot Auto Trading switched OFF.');
    } else {
      setBotStatusNotice('3GP.bot Auto Trading switched ON — press Start Trading to run.');
    }
    void persistRuntimeMode({ autoTradingEnabled: next });
  };

  const handleToggleBirthdayTheme = () => {
    const next = !birthdayTheme;
    setBirthdayTheme(next);
    void persistRuntimeMode({ birthdayTheme: next });
  };

  const handleStartTrading = () => {
    if (emergencyStopped) return;
    if (!autoTradingEnabled) {
      setAutoTradingEnabled(true);
      void persistRuntimeMode({ autoTradingEnabled: true });
    }
    setTradingSessionActive(true);
    setBotStatusNotice(`3GP.bot active on ${selectedPair.symbol} (${timeframe}) · Demo paper execution.`);
    if (!isAnalyzing) {
      void runAnalysis(market, selectedPair, timeframe);
    }
  };

  const handleStopTrading = () => {
    setTradingSessionActive(false);
    setBotStatusNotice('3GP.bot trading session paused.');
  };

  const handleSaveQuotexProfile = async (patch: Partial<QuotexReadinessProfile>) => {
    try {
      const res = await fetch('/api/quotex/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error };
      if (data.accounts) {
        setAccountsSnapshot(data.accounts as AccountsSnapshot);
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'Failed to save Quotex readiness profile.' };
    }
  };

  const handleScanGmailQuotex = async (explicitToken?: string) => {
    const token = explicitToken ?? getGoogleAccessToken();
    if (!token) {
      setGmailError('Please sign in with Google to authorize Gmail email scanning.');
      return;
    }
    setGmailBusy(true);
    setGmailError(null);
    try {
      const res = await fetch('/api/gmail/quotex-check', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setGmailError(data.error ?? 'Failed to scan Gmail for Quotex emails.');
        return;
      }
      setGmailVerification(data.verification as GmailQuotexVerification);
      if (data.accounts) {
        setAccountsSnapshot(data.accounts as AccountsSnapshot);
      }
    } catch {
      setGmailError('Network error reaching Gmail verification service.');
    } finally {
      setGmailBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGmailBusy(true);
    setGmailError(null);
    try {
      const { user, accessToken } = await signInWithGoogleGmail();
      setGoogleUserEmail(user.email ?? null);
      setGoogleUserName(user.displayName ?? null);
      setGoogleTokenReady(true);

      await handleSaveQuotexProfile({
        fullName: user.displayName ?? undefined,
        gmailEmail: user.email ?? undefined,
        gmailVerified: true,
      });

      await handleScanGmailQuotex(accessToken);
    } catch (err) {
      setGmailError(
        err instanceof Error
          ? err.message
          : 'Google Sign-In popup closed or failed.',
      );
    } finally {
      setGmailBusy(false);
    }
  };

  const handleGoogleSignOut = async () => {
    setGmailBusy(true);
    try {
      await signOutGoogleGmail();
      setGoogleUserEmail(null);
      setGoogleUserName(null);
      setGoogleTokenReady(false);
      setGmailVerification(null);
    } finally {
      setGmailBusy(false);
    }
  };

  const handlePlaceDemoTrade = async (direction: 'UP' | 'DOWN', stake: number) => {
    try {
      const res = await fetch('/api/accounts/demo/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pairId: selectedPair.id,
          market,
          timeframe,
          direction,
          stake,
        }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error };
      setAccountsSnapshot({
        demo: data.demo,
        demoTrades: data.demoTrades,
        live: data.live,
        quotex: data.quotex,
        quotexProfile: data.quotexProfile,
      });
      return { ok: true, warning: data.martingaleWarning ?? null };
    } catch {
      return { ok: false, error: 'Unable to submit demo trade.' };
    }
  };

  const handleResetDemo = async () => {
    try {
      const res = await fetch('/api/accounts/demo/reset', { method: 'POST' });
      if (!res.ok) return;
      const data = (await res.json()) as AccountsSnapshot;
      setAccountsSnapshot(data);
    } catch {
      // Ignore
    }
  };

  const handleToggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    if (!next) {
      stopSpeaking();
      setIsSpeaking(false);
    } else {
      speakText(
        buildPairSelectedSpeech(selectedPair.symbol, market, assistantLanguage),
        true,
        () => setIsSpeaking(true),
        () => setIsSpeaking(false),
        assistantLanguage,
      );
    }
  };

  const handleToggleAutoAgent = () => {
    if (emergencyStopped) return;
    const next = !autoAgentEnabled;
    setAutoAgentEnabled(next);
    if (!next && autoNextTimerRef.current) {
      window.clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    } else if (next && !isAnalyzing) {
      void runAnalysis(market, selectedPair, timeframe);
    }
  };

  const handleSelectMarket = (nextMarket: MarketMode) => {
    setMarket(nextMarket);
    const nextPairs = getPairsForMarket(nextMarket);
    const nextPair = nextPairs.some((p) => p.id === selectedPair.id)
      ? selectedPair
      : nextPairs[0];
    setSelectedPair(nextPair);
    if (!emergencyStopped) {
      void fetchScreener(nextMarket, timeframe);
      void fetchAutoBoard(nextMarket);
      void runAnalysis(nextMarket, nextPair, timeframe);
    }
  };

  const handleSelectPair = (nextPair: TradingPair) => {
    manualOverrideUntilRef.current = Date.now() + 55_000;
    setAutoSelectedNotice(null);
    setSelectedPair(nextPair);
    const effectiveTf: Timeframe =
      !supportsSubMinute(nextPair) && timeframe !== '1m' ? '1m' : timeframe;
    if (effectiveTf !== timeframe) {
      setTimeframe(effectiveTf);
      if (!emergencyStopped) void fetchScreener(market, effectiveTf);
    }
    if (voiceEnabled && !emergencyStopped) {
      speakText(
        buildPairSelectedSpeech(nextPair.symbol, market, assistantLanguage),
        true,
        () => setIsSpeaking(true),
        () => setIsSpeaking(false),
        assistantLanguage,
      );
    }
    if (!emergencyStopped) {
      void runAnalysis(market, nextPair, effectiveTf);
    }
  };

  const handleSelectPairIdFromScreener = (pairId: string) => {
    const found = getPairById(pairId);
    if (!found) return;
    handleSelectPair(found);
  };

  const handleSelectPairFromAutoBoard = (pairId: string) => {
    const found = getPairById(pairId);
    if (!found) return;
    manualOverrideUntilRef.current = Date.now() + 55_000;
    setAutoSelectedNotice(null);
    setSelectedPair(found);
    if (timeframe !== '1m') {
      setTimeframe('1m');
      if (!emergencyStopped) void fetchScreener(market, '1m');
    }
    if (!emergencyStopped) void runAnalysis(market, found, '1m');
  };

  const handleAutoSelectBest = () => {
    if (emergencyStopped) return;
    const best = autoBoardData?.signals.find(
      (s) => s.direction === 'UP' || s.direction === 'DOWN',
    );
    if (!best) return;
    const found = getPairById(best.pairId);
    if (!found) return;
    manualOverrideUntilRef.current = 0;
    setSelectedPair(found);
    setTimeframe('1m');
    setAutoSelectedNotice(`Auto-Picked #1 (${best.direction} ${best.confidence}%)`);
    void fetchScreener(market, '1m');
    void runAnalysis(market, found, '1m');
  };

  const handleSelectTimeframe = (nextTf: Timeframe) => {
    setTimeframe(nextTf);
    if (!emergencyStopped) {
      void fetchScreener(market, nextTf);
      void runAnalysis(market, selectedPair, nextTf);
    }
  };

  const handleClearHistory = async () => {
    try {
      const res = await fetch('/api/predictions', { method: 'DELETE' });
      if (!res.ok) return;
      const data = (await res.json()) as {
        records: RecordedPrediction[];
        accuracy: OverallAccuracyReport;
      };
      setRecords(data.records);
      setAccuracy(data.accuracy);
      void fetchVerificationLedger();
    } catch {
      // Ignore
    }
  };

  const activePrediction =
    prediction &&
    prediction.pairId === selectedPair.id &&
    prediction.market === market &&
    prediction.timeframe === timeframe
      ? prediction
      : null;

  return (
    <div
      className={`min-h-screen text-slate-100 pb-20 lg:pb-6 flex flex-col ${
        birthdayTheme ? 'bg-transparent' : 'bg-[#03060E]'
      }`}
    >
      <HeaderBar
        voiceEnabled={voiceEnabled}
        isSpeaking={isSpeaking}
        ownerLocked={ownerSettings?.ownerLocked ?? true}
        emergencyStopped={emergencyStopped}
        assistantLanguage={assistantLanguage}
        onToggleVoice={handleToggleVoice}
        onOpenOwnerLock={() => setOwnerModalOpen(true)}
        onToggleEmergencyStop={() => void handleToggleEmergencyStop()}
        onOpenStats={() => setStatsOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
      />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 pt-4 sm:px-6">
        <BirthdayCelebrationBanner
          birthdayTheme={birthdayTheme}
          autoTradingEnabled={autoTradingEnabled}
          tradingSessionActive={tradingSessionActive}
          emergencyStopped={emergencyStopped}
          onToggleBirthdayTheme={handleToggleBirthdayTheme}
          onStartTrading={handleStartTrading}
          onStopTrading={handleStopTrading}
        />

        <MarketControls
          market={market}
          onSelectMarket={handleSelectMarket}
          pairs={availablePairs}
          selectedPair={selectedPair}
          onSelectPair={handleSelectPair}
          timeframe={timeframe}
          onSelectTimeframe={handleSelectTimeframe}
          disabled={isAnalyzing}
          ownerLocked={ownerSettings?.ownerLocked ?? true}
          primaryMarket={ownerSettings?.primaryMarket ?? 'OTC'}
          primaryTimeframe={ownerSettings?.primaryTimeframe ?? '1m'}
        />

        {/* Primary 3-Column Futuristic Stage: Live Market Screening | Giant Central Signal | Action Rail */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-stretch">
          <div className="order-2 lg:order-1 lg:col-span-3 flex flex-col">
            <LiveScreenerPanel
              market={market}
              timeframe={timeframe}
              rows={screenerRows}
              selectedPairId={selectedPair.id}
              isLoading={screenerLoading}
              errorMessage={screenerError}
              onSelectPairId={handleSelectPairIdFromScreener}
              onRefreshScreener={() => void fetchScreener(market, timeframe)}
            />
          </div>

          <div className="order-1 lg:order-2 lg:col-span-7 flex flex-col gap-4">
            <SignalStage
              market={market}
              pair={selectedPair}
              timeframe={timeframe}
              isAnalyzing={isAnalyzing}
              loadingState={loadingState}
              prediction={activePrediction}
              errorMessage={errorMessage}
              liveQuotePrice={liveQuotePrice}
              liveMonitor={liveMonitor}
              emergencyStopped={emergencyStopped}
              birthdayTheme={birthdayTheme}
              autoSelectedNotice={autoSelectedNotice}
              onStartAnalysis={() => void runAnalysis(market, selectedPair, timeframe)}
              onResumeSystem={() => void handleToggleEmergencyStop()}
            />
            <CandleChartPanel
              candles={candles}
              pair={selectedPair}
              timeframe={timeframe}
              market={market}
              chartOverlay={chartOverlay}
              entryPrice={activePrediction?.entryPrice ?? null}
              direction={activePrediction?.direction ?? null}
              feedSource={feedSource}
              dataStatus={liveMonitor?.dataStatus ?? 'CONNECTED'}
              isAnalyzing={isAnalyzing}
            />
            <AiAgentTelemetry
              prediction={activePrediction}
              liveTelemetry={liveTelemetry}
              isAnalyzing={isAnalyzing}
            />
          </div>

          <div className="order-3 lg:col-span-2 flex flex-col justify-between">
            <ActionRail
              voiceEnabled={voiceEnabled}
              autoAgentEnabled={autoAgentEnabled}
              autoTradingEnabled={autoTradingEnabled}
              tradingSessionActive={tradingSessionActive}
              emergencyStopped={emergencyStopped}
              isAnalyzing={isAnalyzing || emergencyStopped}
              onToggleVoice={handleToggleVoice}
              onToggleAutoAgent={handleToggleAutoAgent}
              onToggleAutoTrading={handleToggleAutoTrading}
              onStartTrading={handleStartTrading}
              onStopTrading={handleStopTrading}
              onRefreshData={() => {
                if (emergencyStopped) return;
                void fetchScreener(market, timeframe);
                void fetchAutoBoard(market, true);
                void runAnalysis(market, selectedPair, timeframe);
              }}
              onOpenHistory={() => setHistoryOpen(true)}
              onOpenStats={() => setStatsOpen(true)}
              onStartAnalysis={() => void runAnalysis(market, selectedPair, timeframe)}
            />
          </div>
        </div>

        <AutoSignalBoard
          market={market}
          boardData={autoBoardData}
          isLoading={autoBoardLoading}
          errorMessage={autoBoardError}
          autoBoardEnabled={autoBoardEnabled}
          autoPairSwitch={autoPairSwitch}
          selectedPairId={selectedPair.id}
          onToggleAutoBoard={() => setAutoBoardEnabled((v) => !v)}
          onToggleAutoPairSwitch={() => setAutoPairSwitch((v) => !v)}
          onAutoSelectBest={handleAutoSelectBest}
          onRefreshBoard={() => {
            if (!emergencyStopped) void fetchAutoBoard(market, true);
          }}
          onSelectPairId={handleSelectPairFromAutoBoard}
        />

        <AccountsAndRiskPanel
          accounts={accountsSnapshot}
          activePair={selectedPair}
          market={market}
          timeframe={timeframe}
          activePrediction={activePrediction}
          defaultStake={ownerSettings?.demoStakeAmount ?? 25}
          defaultPayoutPct={ownerSettings?.defaultPayoutPct ?? 85}
          emergencyStopped={emergencyStopped}
          autoTradingEnabled={autoTradingEnabled}
          tradingSessionActive={tradingSessionActive}
          botStatusNotice={botStatusNotice}
          googleUserEmail={googleUserEmail}
          googleUserName={googleUserName}
          googleTokenReady={googleTokenReady}
          gmailBusy={gmailBusy}
          gmailError={gmailError}
          gmailVerification={gmailVerification}
          onToggleAutoTrading={handleToggleAutoTrading}
          onStartTrading={handleStartTrading}
          onStopTrading={handleStopTrading}
          onGoogleSignIn={handleGoogleSignIn}
          onGoogleSignOut={handleGoogleSignOut}
          onScanGmailQuotex={() => handleScanGmailQuotex()}
          onSaveQuotexProfile={handleSaveQuotexProfile}
          onPlaceDemoTrade={handlePlaceDemoTrade}
          onResetDemo={handleResetDemo}
          onToggleEmergencyStop={() => void handleToggleEmergencyStop()}
          onOpenInAppQuotex={() => setOpenQuotexBrowserNonce((n) => n + 1)}
        />

        <QuotexVisualIntelligencePanel
          platformUrl={accountsSnapshot?.quotex.platformUrl ?? 'https://qxbroker.com/en/sign-in'}
          language={assistantLanguage}
          voiceEnabled={voiceEnabled}
          emergencyStopped={emergencyStopped}
          openBrowserSignal={openQuotexBrowserNonce}
          onToggleEmergencyStop={() => void handleToggleEmergencyStop()}
        />

        <LearningAndVoicePanel
          learning={learningProfile}
          language={assistantLanguage}
          onChangeLanguage={setAssistantLanguage}
          activePair={selectedPair}
          market={market}
          timeframe={timeframe}
          activePrediction={activePrediction}
          voiceEnabled={voiceEnabled}
        />

        <AccuracyPanel accuracy={accuracy} activeTimeframe={timeframe} />
      </main>

      <footer className="mx-auto mt-4 w-full max-w-7xl px-4 py-3 text-center text-xs text-slate-400 sm:px-6">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span>3GP — ISRAR AI TRADING MASTER</span>
          <span aria-hidden="true">·</span>
          <span>Trade Smart</span>
          <span aria-hidden="true">·</span>
          <span>Trade Safe</span>
          <span aria-hidden="true">·</span>
          <span className="text-slate-500">
            Live feeds via Kraken, Binance &amp; Yahoo Finance (Quotex OTC official API not connected)
          </span>
        </div>
      </footer>

      <OwnerSettingsModal
        open={ownerModalOpen}
        settings={ownerSettings}
        ownerToken={ownerToken}
        onClose={() => setOwnerModalOpen(false)}
        onClaimPasscode={handleClaimPasscode}
        onUnlock={handleUnlockOwner}
        onLockRelock={() => setOwnerToken(null)}
        onSaveSettings={handleSaveOwnerSettings}
      />

      <HistoryModal
        open={historyOpen}
        records={records}
        isSettling={isSettling}
        onClose={() => setHistoryOpen(false)}
        onSettleNow={() => void settleExpired()}
        onClearHistory={() => void handleClearHistory()}
      />

      <StatsModal
        open={statsOpen}
        accuracy={accuracy}
        onClose={() => setStatsOpen(false)}
      />
    </div>
  );
}
