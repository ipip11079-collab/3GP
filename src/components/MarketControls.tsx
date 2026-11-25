import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Clock, Globe, Lock, Search, X } from 'lucide-react';
import { supportsSubMinute, TIMEFRAMES } from '../lib/pairs.ts';
import type { MarketMode, Timeframe, TradingPair } from '../types/trading.ts';

interface MarketControlsProps {
  market: MarketMode;
  onSelectMarket: (m: MarketMode) => void;
  pairs: TradingPair[];
  selectedPair: TradingPair;
  onSelectPair: (pair: TradingPair) => void;
  timeframe: Timeframe;
  onSelectTimeframe: (tf: Timeframe) => void;
  disabled?: boolean;
  ownerLocked?: boolean;
  primaryMarket?: MarketMode;
  primaryTimeframe?: Timeframe;
}

export function MarketControls({
  market,
  onSelectMarket,
  pairs,
  selectedPair,
  onSelectPair,
  timeframe,
  onSelectTimeframe,
  disabled = false,
  ownerLocked = false,
  primaryMarket = 'OTC',
  primaryTimeframe = '1m',
}: MarketControlsProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'FX' | 'COMMODITY' | 'CRYPTO'>('ALL');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [dropdownOpen]);

  useEffect(() => {
    if (dropdownOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 40);
    } else {
      setSearchQuery('');
    }
  }, [dropdownOpen]);

  const filteredPairs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return pairs.filter((p) => {
      if (categoryFilter !== 'ALL' && p.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.symbol.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.base.toLowerCase().includes(q) ||
        p.quote.toLowerCase().includes(q)
      );
    });
  }, [pairs, searchQuery, categoryFilter]);

  return (
    <section
      aria-label="Market, Pair, and Timeframe Controls"
      className="grid grid-cols-1 gap-3 lg:grid-cols-12"
    >
      {/* 1. Market Selection */}
      <div className="neon-panel rounded-2xl p-3 lg:col-span-4">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-sky-300">
          <span className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
            <span>Market Selection</span>
          </span>
          <span className="font-mono text-[10px] text-amber-300/90 flex items-center gap-1">
            {ownerLocked && <Lock className="h-3 w-3" aria-hidden="true" />}
            Primary: {primaryMarket}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Market Type">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelectMarket('LIVE')}
            aria-pressed={market === 'LIVE'}
            className={`min-h-[44px] rounded-xl px-3 py-2 text-xs sm:text-sm font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400 ${
              market === 'LIVE'
                ? 'neon-panel-active text-white'
                : 'border border-sky-500/25 bg-[#060E20] text-slate-300 hover:border-sky-400/60 hover:text-white'
            }`}
          >
            LIVE MARKET
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelectMarket('OTC')}
            aria-pressed={market === 'OTC'}
            className={`min-h-[44px] rounded-xl px-3 py-2 text-xs sm:text-sm font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400 ${
              market === 'OTC'
                ? 'neon-panel-active text-white'
                : 'border border-sky-500/25 bg-[#060E20] text-slate-300 hover:border-sky-400/60 hover:text-white'
            }`}
          >
            OTC MARKET
          </button>
        </div>
      </div>

      {/* 2. Searchable Currency Pair Selector */}
      <div ref={containerRef} className="neon-panel relative rounded-2xl p-3 lg:col-span-4">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-sky-300">
          <span className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
            <span>{market === 'OTC' ? 'Select OTC Pair' : 'Select Live Pair'}</span>
          </span>
          <span className="text-[11px] font-normal text-slate-400">
            {pairs.length} pairs
          </span>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => setDropdownOpen((o) => !o)}
          aria-expanded={dropdownOpen}
          aria-haspopup="listbox"
          aria-label={`Select Currency Pair, currently ${selectedPair.symbol}`}
          className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border border-sky-400/50 bg-[#061024] px-3.5 py-2 text-left text-white transition-colors hover:border-sky-300 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex h-7 w-10 shrink-0 items-center justify-center rounded-md border border-sky-400/40 bg-sky-500/15 font-mono text-[11px] font-bold text-sky-200">
              {selectedPair.base}
            </span>
            <div className="min-w-0">
              <div className="font-display text-sm sm:text-base font-bold tracking-wide text-white whitespace-nowrap truncate">
                {selectedPair.symbol}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {selectedPair.name}
              </div>
            </div>
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-sky-400 transition-transform ${
              dropdownOpen ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>

        {dropdownOpen && (
          <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-2xl border border-sky-400/70 bg-[#050C1B] p-3 shadow-[0_18px_48px_rgba(0,0,0,0.85)]">
            <div className="mb-2.5 flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-400"
                  aria-hidden="true"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search pair (EUR/USD, XAU, INR, BTC)..."
                  aria-label="Search currency pairs"
                  className="min-h-[40px] w-full rounded-xl border border-sky-500/40 bg-[#030712] pl-9 pr-8 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="mb-2.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="Pair category filter">
              {(['ALL', 'FX', 'COMMODITY', 'CRYPTO'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`min-h-[34px] rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    categoryFilter === cat
                      ? 'bg-sky-500/25 text-sky-200 border border-sky-400/60'
                      : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  {cat === 'ALL'
                    ? 'All'
                    : cat === 'FX'
                      ? 'Forex'
                      : cat === 'COMMODITY'
                        ? 'Metals'
                        : 'Crypto 24/7'}
                </button>
              ))}
            </div>

            <div
              role="listbox"
              aria-label="Available Currency Pairs"
              className="max-h-64 overflow-y-auto space-y-1 pr-1"
            >
              {filteredPairs.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  No matching pairs found for &ldquo;{searchQuery}&rdquo;.
                </div>
              ) : (
                filteredPairs.map((pair) => {
                  const isSelected = pair.id === selectedPair.id;
                  const tickCapable = supportsSubMinute(pair);
                  return (
                    <button
                      key={pair.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onSelectPair(pair);
                        setDropdownOpen(false);
                      }}
                      className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-sky-500/20 border border-sky-400/60 text-white'
                          : 'border border-transparent hover:bg-sky-500/10 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="inline-flex h-6 w-10 shrink-0 items-center justify-center rounded border border-sky-500/30 bg-[#081329] font-mono text-[11px] font-semibold text-sky-300">
                          {pair.base}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white whitespace-nowrap">
                            {pair.symbol}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {pair.name}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!tickCapable && (
                          <span className="rounded border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                            1m
                          </span>
                        )}
                        <span className="text-[11px] font-mono text-sky-300/80">
                          {pair.category === 'COMMODITY' ? 'METAL' : pair.category}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. Strict 4 Timeframes: 5s, 10s, 30s, 1m */}
      <div className="neon-panel rounded-2xl p-3 lg:col-span-4">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-sky-300">
          <span className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
            <span>Time Frame ({market})</span>
          </span>
          <span className="font-mono text-[10px] text-emerald-300/90">
            Primary: {primaryTimeframe}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="Timeframe Selection">
          {TIMEFRAMES.map((tf) => {
            const active = timeframe === tf.value;
            return (
              <button
                key={tf.value}
                type="button"
                disabled={disabled}
                onClick={() => onSelectTimeframe(tf.value)}
                aria-pressed={active}
                className={`flex min-h-[44px] flex-col items-center justify-center rounded-xl px-2 py-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400 ${
                  active
                    ? 'neon-panel-active text-white'
                    : 'border border-sky-500/25 bg-[#060E20] text-slate-300 hover:border-sky-400/60 hover:text-white'
                }`}
              >
                <span className="font-mono text-sm font-bold leading-tight">
                  {tf.label}
                </span>
                <span className="text-[10px] font-medium text-sky-200/80 leading-tight">
                  {tf.sublabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
