import React from "react";

interface HealthGaugeProps {
  conflictsCount: number;
  overlapsCount: number;
  warningsCount: number;
}

export function HealthGauge({ conflictsCount, overlapsCount, warningsCount }: HealthGaugeProps) {
  // Compute health score dynamically starting at 100
  const score = Math.max(
    0,
    100 - conflictsCount * 15 - overlapsCount * 5 - warningsCount * 3
  );

  // Determine status color palette and labels based on score
  let strokeColor = "stroke-emerald-500";
  let glowColor = "shadow-emerald-950/20 border-emerald-500/20";
  let textColor = "text-emerald-400";
  let ratingLabel = "Excellent";
  let ratingDesc = "Registry is highly optimized and secure.";

  if (score < 70) {
    strokeColor = "stroke-red-500";
    glowColor = "shadow-red-950/30 border-red-500/20 animate-pulse";
    textColor = "text-red-400";
    ratingLabel = "Critical";
    ratingDesc = "Active conflicts detected. Action required.";
  } else if (score < 90) {
    strokeColor = "stroke-amber-500";
    glowColor = "shadow-amber-950/20 border-amber-500/20";
    textColor = "text-amber-400";
    ratingLabel = "Warnings";
    ratingDesc = "Minor warnings or overlaps detected.";
  }

  // SVG ring properties
  const radius = 60;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className={`bg-gray-900/50 backdrop-blur-md border rounded-xl p-6 flex flex-col items-center justify-center text-center transition-all hover:-translate-y-0.5 shadow-lg ${glowColor}`}>
      <span className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-4">
        Registry Health
      </span>

      <div className="relative flex items-center justify-center mb-4">
        {/* SVG Progress Circle */}
        <svg className="w-36 h-36 transform -rotate-90" viewBox="0 0 140 140">
          {/* Background circle track */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            className="stroke-gray-800 fill-none"
            strokeWidth={strokeWidth}
          />
          {/* Foreground animated progress circle */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            className={`fill-none transition-all duration-1000 ease-out ${strokeColor}`}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>

        {/* Center Text */}
        <div className="absolute flex flex-col items-center justify-center">
          <span className="text-3xl font-extrabold text-white tracking-tight">
            {score}%
          </span>
          <span className={`text-xs font-semibold uppercase tracking-wider mt-0.5 ${textColor}`}>
            {ratingLabel}
          </span>
        </div>
      </div>

      <div className="text-xs text-gray-500 leading-normal max-w-[200px] mt-1">
        {ratingDesc}
      </div>

      {/* Point breakdown explanation */}
      <div className="w-full border-t border-gray-800/80 mt-4 pt-3 flex justify-around text-2xs font-mono text-gray-400">
        <div className="flex flex-col">
          <span className="text-white font-bold">{conflictsCount}</span>
          <span>Conflicts</span>
        </div>
        <div className="flex flex-col border-x border-gray-800/80 px-4">
          <span className="text-white font-bold">{overlapsCount}</span>
          <span>Overlaps</span>
        </div>
        <div className="flex flex-col">
          <span className="text-white font-bold">{warningsCount}</span>
          <span>Warnings</span>
        </div>
      </div>
    </div>
  );
}
