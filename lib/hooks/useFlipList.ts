"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * FLIP (First, Last, Invert, Play) 애니메이션 훅.
 * 리스트 아이템의 순서가 변경(위/아래 이동)될 때 GPU 가속 기반의 부드러운 위치 슬라이딩 트랜지션을 제공합니다.
 */
export function useFlipList<T extends { id: string }>(items: T[]) {
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const prevRects = useRef<Map<string, DOMRect>>(new Map());

  const registerRef = (id: string) => (el: HTMLElement | null) => {
    if (el) {
      itemRefs.current.set(id, el);
    } else {
      itemRefs.current.delete(id);
    }
  };

  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const nextRects = new Map<string, DOMRect>();

    itemRefs.current.forEach((el, id) => {
      // 1. First/Last: 현재 렌더링된 새 타깃 위치 측정
      const currentRect = el.getBoundingClientRect();
      nextRects.set(id, currentRect);

      const prevRect = prevRects.current.get(id);
      if (prevRect && !prefersReducedMotion) {
        const deltaY = prevRect.top - currentRect.top;

        // 1px 이상 위치 변동이 있는 경우에만 슬라이드 애니메이션 적용
        if (Math.abs(deltaY) > 1) {
          // 2. Invert: 이전 위치로 순간 이동
          el.style.transform = `translateY(${deltaY}px)`;
          el.style.transition = "none";
          el.style.zIndex = "10";
          el.style.willChange = "transform";

          // 브라우저 리플로우 강제 동기화
          void el.offsetHeight;

          // 3. Play: 부드러운 이징 곡선으로 원래 위치(translateY 0)로 안착
          requestAnimationFrame(() => {
            el.style.transition = "transform 260ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1))";
            el.style.transform = "";

            const handleEnd = () => {
              el.style.transition = "";
              el.style.zIndex = "";
              el.style.willChange = "";
              el.removeEventListener("transitionend", handleEnd);
            };
            el.addEventListener("transitionend", handleEnd);
          });
        }
      }
    });

    prevRects.current = nextRects;
  }, [items]);

  return { registerRef };
}
