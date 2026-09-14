import React from "react";

export type RbLogoVariant = "bold-extended" | "geometric-sans" | "monoline-sans";

interface RbLogoIconProps {
  size?: number;
  variant?: RbLogoVariant;
  className?: string;
}

/**
 * 로고 타일. 이름 전체를 넣을 자리가 없는 곳(파비콘, 앱 아이콘, 좁은 헤더)에서 쓴다.
 * 두 글자라 한 글자일 때보다 글자 크기를 줄여야 사각형 안에 들어간다.
 */
export function RbLogoIcon({
  size = 20,
  variant = "bold-extended",
  className = "",
}: RbLogoIconProps) {
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
      aria-label="RB Global Logo Icon"
    >
      <span
        style={{
          fontSize: `${Math.max(9, Math.round(size * 0.44))}px`,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          transform: variant === "bold-extended" ? "scaleX(1.04)" : undefined,
        }}
      >
        RB
      </span>
    </div>
  );
}

interface RbLogoProps {
  size?: number;
  showIcon?: boolean;
  variant?: RbLogoVariant;
  className?: string;
}

/**
 * RB Global 브랜드 로고 컴포넌트
 * - bold-extended: [시안 3번] 묵직하고 시원한 볼드 익스텐디드 네오 그로테스크 (기본 활성)
 * - geometric-sans: [시안 2번 킵] 정교한 기하학적 스위스 산세리프
 * - monoline-sans: [시안 5번 킵] 균일한 두께와 여백의 모놀라인 아키텍처럴 산세리프
 *
 * 글자를 대문자로 강제하지 않는다. 상호가 "RB GLOBAL" 이 아니라 "RB Global" 이다.
 */
export default function RbLogo({
  size = 20,
  showIcon = false,
  variant = "bold-extended",
  className = "",
}: RbLogoProps) {
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
      {showIcon && <RbLogoIcon size={size + 4} variant={variant} />}
      <span
        style={{
          fontSize: `${size}px`,
          fontFamily: typoStyle.fontFamily,
          fontWeight: typoStyle.fontWeight,
          letterSpacing: typoStyle.letterSpacing,
          transform: typoStyle.transform,
          transformOrigin: "left center",
          whiteSpace: "nowrap",
        }}
        className="text-text transition-colors duration-150 group-hover:text-accent-link leading-none"
      >
        RB Global
      </span>
    </div>
  );
}
