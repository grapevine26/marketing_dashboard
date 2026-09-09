import React from "react";

interface SeedLogoIconProps {
  size?: number;
  className?: string;
}

export function SeedLogoIcon({ size = 20, className = "" }: SeedLogoIconProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        fontFamily: 'ui-serif, Georgia, "Times New Roman", Cambria, serif',
      }}
      className={`inline-flex items-center justify-center rounded-lg bg-surface2 border border-border text-text font-bold select-none shrink-0 shadow-xs transition-colors duration-200 group-hover:border-border/80 group-hover:bg-surface3 ${className}`}
      aria-label="Seed Logo Icon"
    >
      <span
        style={{ fontSize: `${Math.max(10, Math.round(size * 0.62))}px`, lineHeight: 1 }}
        className="tracking-normal"
      >
        S
      </span>
    </div>
  );
}

interface SeedLogoProps {
  size?: number;
  showBadge?: boolean;
  showIcon?: boolean;
  className?: string;
}

export default function SeedLogo({
  size = 20,
  showBadge = true,
  showIcon = false,
  className = "",
}: SeedLogoProps) {
  return (
    <div className={`flex items-center gap-2 group select-none ${className}`}>
      {showIcon && <SeedLogoIcon size={size + 4} />}
      <div className="flex items-center gap-2">
        <span
          style={{
            fontSize: `${size}px`,
            fontFamily: 'ui-serif, Georgia, "Times New Roman", Cambria, serif',
          }}
          className="font-bold tracking-[0.16em] uppercase text-text transition-colors duration-150 group-hover:text-accent-link leading-none"
        >
          SEED
        </span>
        {showBadge && (
          <span className="text-[10px] font-medium text-text-muted bg-surface2 border border-border px-1.5 py-0.5 rounded leading-none transition-colors group-hover:text-text-sub">
            시드
          </span>
        )}
      </div>
    </div>
  );
}

