"use client";

import { useEffect, type RefObject } from "react";

/** 탭으로 갈 수 있는 것들. `disabled` 와 `tabindex="-1"` 은 뺀다. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * 모달이 열려 있는 동안 키보드 포커스를 그 안에 가둔다. 닫으면 열기 전 자리로 돌려놓는다.
 *
 * **왜 필요한가** — 모달은 화면을 덮고 있지만 탭 키는 그걸 모른다. 처리를 안 하면
 * 탭을 누를 때마다 포커스가 **모달 뒤에 가려진 화면**으로 새어 나간다. 마우스를 쓰는
 * 사람에게는 안 보이지만, 키보드나 화면낭독기를 쓰는 사람에게는 모달이 열린 순간
 * 자기가 어디 있는지 알 수 없게 된다. 보이지 않는 버튼에 포커스가 가서 엉뚱한 것이
 * 눌리기도 한다.
 *
 * 돌려놓는 것도 중요하다. 닫은 뒤 포커스가 문서 맨 처음으로 튀면, 아까 누른 자리로
 * 돌아가려고 탭을 수십 번 눌러야 한다.
 *
 * 열 때 포커스는 **첫 번째 요소가 아니라 모달 자체**에 준다. 첫 요소가 [닫기] 이거나
 * 위험한 버튼일 수 있어서다. 모달에 `tabIndex={-1}` 을 주어야 이게 동작한다.
 */
export function useFocusTrap(open: boolean, ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;

    // 열기 전에 어디에 있었는지 기억한다. 닫을 때 여기로 돌려놓는다.
    const 이전 = document.activeElement as HTMLElement | null;
    node.focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const 갈수있는곳 = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        // 숨겨진 것은 빼야 한다. display:none 인 요소는 크기가 0 이다.
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
      );
      if (갈수있는곳.length === 0) {
        // 누를 것이 하나도 없으면 모달 밖으로 나가지만 않게 한다.
        e.preventDefault();
        return;
      }
      const 처음 = 갈수있는곳[0]!;
      const 마지막 = 갈수있는곳[갈수있는곳.length - 1]!;
      const 지금 = document.activeElement;

      if (e.shiftKey && (지금 === 처음 || 지금 === node)) {
        e.preventDefault();
        마지막.focus();
      } else if (!e.shiftKey && 지금 === 마지막) {
        e.preventDefault();
        처음.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // 열기 전 자리가 아직 화면에 있을 때만 돌려놓는다. 사라진 요소에 포커스를 주면
      // 브라우저가 <body> 로 보내 버려서 아무것도 안 한 것보다 나쁘다.
      if (이전 && document.contains(이전)) 이전.focus({ preventScroll: true });
    };
  }, [open, ref]);
}
