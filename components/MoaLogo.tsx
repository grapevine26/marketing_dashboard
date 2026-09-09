import React from "react";

export type MoaLogoVariant = "bold-extended" | "geometric-sans" | "monoline-sans";

interface MoaLogoIconProps {
  size?: number;
  variant?: MoaLogoVariant;
  className?: string;
}

export function MoaLogoIcon({
  size = 20,
  variant = "bold-extended",
  className = "",
}: MoaLogoIconProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
      className={`inline-flex items-center justify-center rounded-lg bg-surface2 border border-border text-text select-none shrink-0 shadow-xs transition-colors duration-200 group-hover:border-border/80 group-hover:bg-surface3 ${
        variant === "bold-extended"
          ? "font-black"
          : variant === "monoline-sans"
          ? "font-medium"
          : "font-bold"
      } ${className}`}
      aria-label="MOA Logo Icon"
    >
      <span
        style={{
          fontSize: `${Math.max(10, Math.round(size * 0.64))}px`,
          lineHeight: 1,
          transform: variant === "bold-extended" ? "scaleX(1.08)" : undefined,
        }}
      >
        M
      </span>
    </div>
  );
}

interface MoaLogoProps {
  size?: number;
  showBadge?: boolean;
  showIcon?: boolean;
  variant?: MoaLogoVariant;
  className?: string;
}

/**
 * MOA 브랜드 로고 컴포넌트
 * - bold-extended: [시안 3번] 묵직하고 시원한 볼드 익스텐디드 네오 그로테스크 (기본 활성)
 * - geometric-sans: [시안 2번 킵] 정교한 기하학적 스위스 산세리프
 * - monoline-sans: [시안 5번 킵] 균일한 두께와 여백의 모놀라인 아키텍처럴 산세리프
 */
export default function MoaLogo({
  size = 20,
  showBadge = true,
  showIcon = false,
  variant = "bold-extended",
  className = "",
}: MoaLogoProps) {
  const getTypographyStyle = () => {
    switch (variant) {
      case "geometric-sans": // 2번 시안 (킵)
        return {
          fontFamily:
            '"Futura", "Circular Std", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontWeight: 800,
          letterSpacing: "0.12em",
          transform: "none",
        };
      case "monoline-sans": // 5번 시안 (킵)
        return {
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontWeight: 500,
          letterSpacing: "0.22em",
          transform: "none",
        };
      case "bold-extended": // 3번 시안 (현재 적용)
      default:
        return {
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          fontWeight: 900,
          letterSpacing: "0.05em",
          transform: "scaleX(1.06)",
        };
    }
  };

  const typoStyle = getTypographyStyle();

  return (
    <div className={`flex items-center gap-2 group select-none ${className}`}>
      {showIcon && <MoaLogoIcon size={size + 4} variant={variant} />}
      <div className="flex items-center gap-1.5">
        <span
          style={{
            fontSize: `${size}px`,
            fontFamily: typoStyle.fontFamily,
            fontWeight: typoStyle.fontWeight,
            letterSpacing: typoStyle.letterSpacing,
            transform: typoStyle.transform,
            transformOrigin: "left center",
          }}
          className="uppercase text-text transition-colors duration-150 group-hover:text-accent-link leading-none"
        >
          MOA
        </span>
        {showBadge && (
          <span className="text-[10px] font-bold text-text-muted bg-surface2 border border-border px-1.5 py-0.5 rounded leading-none transition-colors group-hover:text-text-sub ml-0.5">
            모아
          </span>
        )}
      </div>
    </div>
  );
}
