"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 저장이 끝나기 전에 화면을 떠나는 것을 막는다.
 *
 * **왜 필요한가.** 상태 드롭다운이나 선정 버튼은 화면을 먼저 바꾸고 저장은 뒤에서 한다.
 * 그래서 눌러 놓고 곧바로 다른 메뉴로 넘어가면 브라우저가 진행 중이던 요청을 끊어 버린다.
 * 화면에는 바뀐 것처럼 보였는데 DB 에는 남지 않는다. 사람이 알아채기 어려운 종류의 손실이다.
 *
 * 저장 자체는 빠르다(재어 보니 100밀리초 안쪽). 느려서 생기는 문제가 아니라, 빠르더라도
 * 그 사이에 클릭이 들어가면 끊긴다는 문제다. 그래서 막는 비용이 거의 없다.
 *
 * **막기만 하지 않고 기억한다.** 이동을 그냥 취소하면 사용자는 자기 클릭이 무시당한 줄 알고
 * 다시 누른다. 그래서 가려던 주소를 적어 두었다가 저장이 끝나는 순간 대신 이동시킨다.
 * 사용자 입장에서는 살짝 늦게 넘어갈 뿐이다.
 */

interface SaveGuard {
  /** 저장을 시작할 때 부른다. 끝나면 돌려받은 함수를 반드시 부를 것. */
  begin: () => () => void;
  /** 지금 저장 중인가. 화면에 표시하고 싶을 때 쓴다. */
  saving: boolean;
  /**
   * 이동해도 되는지 묻는다. 저장 중이면 false 를 주고 그 주소를 기억한다.
   * Link 의 onNavigate 에서 false 면 preventDefault 한다.
   */
  allowNavigate: (href: string) => boolean;
}

const Ctx = createContext<SaveGuard | null>(null);

/** 가드 밖에서 불러도 터지지 않는다. 저장은 그대로 되고 이동만 막지 않는다. */
const NOOP: SaveGuard = { begin: () => () => {}, saving: false, allowNavigate: () => true };

export function useSaveGuard(): SaveGuard {
  return useContext(Ctx) ?? NOOP;
}

export function PendingSaveProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  // 진행 중인 저장 개수. 여러 개가 겹칠 수 있어 불리언이 아니라 세어야 한다.
  const countRef = useRef(0);
  const queuedRef = useRef<string | null>(null);

  const begin = useCallback(() => {
    countRef.current += 1;
    setSaving(true);
    let released = false;
    return () => {
      // 같은 저장이 두 번 끝났다고 세지 않게 한다. finally 와 catch 가 겹칠 수 있다.
      if (released) return;
      released = true;
      countRef.current = Math.max(0, countRef.current - 1);
      if (countRef.current > 0) return;
      setSaving(false);
      const href = queuedRef.current;
      queuedRef.current = null;
      // 저장이 다 끝났으니 아까 가려던 곳으로 대신 보내 준다.
      if (href) router.push(href);
    };
  }, [router]);

  const allowNavigate = useCallback((href: string) => {
    if (countRef.current === 0) return true;
    queuedRef.current = href;
    return false;
  }, []);

  return <Ctx.Provider value={{ begin, saving, allowNavigate }}>{children}</Ctx.Provider>;
}

/**
 * 저장을 가드로 감싼다. 성공하든 실패하든 반드시 풀린다.
 *
 *   const res = await guardedSave(guard, () => safeCall(someAction(...)));
 */
export async function guardedSave<T>(guard: SaveGuard, run: () => Promise<T>): Promise<T> {
  const done = guard.begin();
  try {
    return await run();
  } finally {
    done();
  }
}
