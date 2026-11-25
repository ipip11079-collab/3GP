import type { SignalDirection } from '../types/trading.ts';

interface AiPartnerPanelProps {
  isAnalyzing: boolean;
  isSpeaking: boolean;
  direction: SignalDirection | null;
}

export function AiPartnerPanel({
  isAnalyzing,
  isSpeaking,
  direction,
}: AiPartnerPanelProps) {
  const accentColor =
    direction === 'UP'
      ? '#22C55E'
      : direction === 'DOWN'
        ? '#EF4444'
        : direction === 'NO_TRADE'
          ? '#F59E0B'
          : '#38BDF8';

  return (
    <aside
      aria-label="3GP AI Partner"
      className="neon-panel hidden lg:flex flex-col items-center justify-between rounded-2xl p-4 text-center"
    >
      <div className="relative flex flex-1 items-center justify-center py-2">
        {/* 3D Holographic Orbital Backdrop */}
        <div
          className="absolute h-44 w-44 rounded-full border border-sky-400/30 animate-orbit-slow"
          aria-hidden="true"
        />
        <div
          className="absolute h-36 w-36 rounded-full border border-dashed border-sky-300/35 animate-orbit-reverse"
          aria-hidden="true"
        />

        {/* Crisp Custom 3D-Styled 3GP AI Bot Emblem SVG */}
        <svg
          viewBox="0 0 200 230"
          className="relative z-10 h-48 w-44 drop-shadow-[0_0_24px_rgba(14,165,233,0.45)]"
          role="img"
          aria-label="3GP AI Trading Assistant Hologram"
        >
          <defs>
            <linearGradient id="botShell" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#E2E8F0" />
              <stop offset="50%" stopColor="#94A3B8" />
              <stop offset="100%" stopColor="#334155" />
            </linearGradient>
            <linearGradient id="botChest" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0F172A" />
              <stop offset="100%" stopColor="#020617" />
            </linearGradient>
            <linearGradient id="goldCrown" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FDE047" />
              <stop offset="50%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#FEF08A" />
            </linearGradient>
          </defs>

          {/* Headset Earcups */}
          <rect x="28" y="54" width="16" height="38" rx="8" fill="#0EA5E9" />
          <rect x="156" y="54" width="16" height="38" rx="8" fill="#0EA5E9" />
          <path
            d="M 38 56 C 42 18, 158 18, 162 56"
            fill="none"
            stroke="#38BDF8"
            strokeWidth="6"
            strokeLinecap="round"
          />

          {/* Bot Head */}
          <rect
            x="44"
            y="34"
            width="112"
            height="78"
            rx="34"
            fill="url(#botShell)"
            stroke="#38BDF8"
            strokeWidth="2.5"
          />

          {/* Visor Screen */}
          <rect
            x="56"
            y="48"
            width="88"
            height="50"
            rx="20"
            fill="#020617"
            stroke={accentColor}
            strokeWidth="2"
          />

          {/* Glowing Expressive AI Eyes */}
          <path
            d={
              isAnalyzing
                ? 'M 72 72 L 88 72'
                : 'M 70 72 Q 80 60 90 72'
            }
            fill="none"
            stroke={accentColor}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d={
              isAnalyzing
                ? 'M 112 72 L 128 72'
                : 'M 110 72 Q 120 60 130 72'
            }
            fill="none"
            stroke={accentColor}
            strokeWidth="5"
            strokeLinecap="round"
          />

          {/* Speaking Waveform Mouth */}
          <path
            d={
              isSpeaking
                ? 'M 84 85 Q 92 78 100 85 T 116 85'
                : 'M 88 85 Q 100 92 112 85'
            }
            fill="none"
            stroke="#7DD3FC"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Neck & Torso */}
          <rect x="84" y="112" width="32" height="12" rx="4" fill="#1E293B" />
          <path
            d="M 48 124 L 152 124 L 140 202 C 138 210 130 214 120 214 L 80 214 C 70 214 62 210 60 202 Z"
            fill="url(#botShell)"
            stroke="#38BDF8"
            strokeWidth="2.5"
          />

          {/* Chest Core */}
          <rect
            x="64"
            y="134"
            width="72"
            height="62"
            rx="16"
            fill="url(#botChest)"
            stroke={accentColor}
            strokeWidth="2"
          />

          {/* Gold Crown on Chest */}
          <path
            d="M 85 154 L 89 144 L 96 150 L 100 141 L 104 150 L 111 144 L 115 154 Z"
            fill="url(#goldCrown)"
          />
          <text
            x="100"
            y="179"
            textAnchor="middle"
            fill="#F8FAFC"
            fontFamily="Outfit, sans-serif"
            fontWeight="800"
            fontSize="20"
          >
            3GP
          </text>
        </svg>
      </div>

      <div className="w-full rounded-xl border border-sky-400/40 bg-[#050C1E] px-3 py-2.5">
        <div className="font-display text-sm font-bold text-amber-300">
          Your Trading Partner
        </div>
        <div className="mt-0.5 text-xs text-sky-200/80">
          {isAnalyzing
            ? 'Scanning candles & liquidity…'
            : isSpeaking
              ? 'Voice Guidance Active'
              : 'Ready for Confirmation'}
        </div>
      </div>
    </aside>
  );
}
