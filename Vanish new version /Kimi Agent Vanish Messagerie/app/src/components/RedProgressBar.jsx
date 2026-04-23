import { useMemo } from 'react';

export default function RedProgressBar({ ttl, max = 180 }) {
  const pct = Math.max(0, (ttl / max) * 100);
  const isCritical = ttl <= 30 && ttl > 0;

  const color = isCritical ? '#ff3333' : '#ff003c';

  return (
    <div
      className="w-full rounded-full overflow-hidden mt-2 relative"
      style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.1)' }}
    >
      {/* Glow layer */}
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-linear opacity-50"
        style={{
          width: `${pct}%`,
          backgroundColor: color,
          filter: 'blur(4px)',
          animation: isCritical ? 'ttl-pulse 0.5s infinite alternate' : 'pulse 2s infinite cubic-bezier(0.4, 0, 0.6, 1)',
        }}
      />
      {/* Solid bar */}
      <div
        className="relative h-full rounded-full transition-all duration-1000 ease-linear"
        style={{
          width: `${pct}%`,
          backgroundColor: color,
          boxShadow: isCritical
            ? '0 0 10px rgba(255, 51, 51, 1)'
            : '0 0 5px rgba(255, 0, 60, 0.8)',
        }}
      />
    </div>
  );
}
