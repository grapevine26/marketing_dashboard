import React from "react";

/**
 * 로고 타일. 이름 전체를 넣을 자리가 없는 곳에서 쓴다.
 * 두 글자라 한 글자일 때보다 글자 크기를 줄여야 사각형 안에 들어간다.
 */
export function RbLogoIcon({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <div
      style={{ width: size, height: size, fontFamily: "var(--font-brand), sans-serif", fontWeight: 800 }}
      className={`inline-flex items-center justify-center rounded-lg bg-surface2 border border-border text-text select-none shrink-0 shadow-xs transition-colors duration-200 group-hover:border-border/80 group-hover:bg-surface3 ${className}`}
      aria-label="RB Global"
    >
      <span
        style={{
          fontSize: `${Math.max(9, Math.round(size * 0.5))}px`,
          lineHeight: 1,
          letterSpacing: "-0.045em",
        }}
      >
        RB
      </span>
    </div>
  );
}

/**
 * RB Global 브랜드 로고.
 *
 * 글꼴은 Inter ExtraBold 다. app/layout.tsx 에서 --font-brand 로 넣어 준다.
 * 이 글꼴 자체가 충분히 굵어서, 예전처럼 글자를 가로로 늘려 두께를 흉내 낼 필요가 없다.
 *
 * 대문자로 강제하지 않는다. 상호가 "RB GLOBAL" 이 아니라 "RB Global" 이다.
 */
export default function RbLogo({
  size = 20,
  showIcon = false,
  className = "",
}: {
  size?: number;
  showIcon?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 group select-none ${className}`}>
      {showIcon && <RbLogoIcon size={size + 4} />}
      <span
        style={{
          fontSize: `${size}px`,
          fontFamily: "var(--font-brand), -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
          fontWeight: 800,
          letterSpacing: "-0.02em",
          whiteSpace: "nowrap",
        }}
        className="text-text transition-colors duration-150 group-hover:text-accent-link leading-none"
      >
        RB Global
      </span>
    </div>
  );
}
