"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
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
 *
 * ---
 *
 * **저장 '중' 과 저장 '안 한' 은 다르다.** 위의 이야기는 전부 저장 중(saving)에 대한 것이다.
 * 요청이 날아가고 있으니 잠깐 붙잡았다가 끝나면 대신 보내 주면 된다 — 기다리면 해결된다.
 *
 * 편집기에 고쳐 놓고 저장을 아직 **안 누른** 상태(dirty)는 성격이 다르다. 기다려도 저장되지
 * 않고, 화면을 떠나면 그대로 사라진다. 그래서 미루기가 아니라 **물어봐야** 한다.
 * 그 둘을 한 상태로 뭉뚱그리면, 저장 중일 때 쓸데없이 확인창을 띄우거나 저장 안 한 편집분을
 * 조용히 버리게 된다.
 *
 * dirty 는 두 곳에서 쓰인다.
 * - `beforeunload`: 새로고침·탭 닫기·주소창 이동처럼 React 가 손댈 수 없는 이탈을 브라우저가 막는다.
 * - `allowNavigate`: 사이드바 Link 이동 때 확인을 받는다.
 *
 * `beforeunload` 는 **필요할 때만** 붙인다. 늘 붙여 두면 브라우저가 이 탭을 bfcache 에서
 * 제외해 뒤로가기가 느려진다.
 */

interface SaveGuard {
  /** 저장을 시작할 때 부른다. 끝나면 돌려받은 함수를 반드시 부를 것. */
  begin: () => () => void;
  /** 지금 저장 중인가. 화면에 표시하고 싶을 때 쓴다. */
  saving: boolean;
  /**
   * 이동해도 되는지 묻는다. 저장 중이면 false 를 주고 그 주소를 기억한다.
   * 저장 안 한 변경이 있으면 사용자에게 확인을 받고, 그대로 가겠다고 하면 true 를 준다.
   * Link 의 onNavigate 에서 false 면 preventDefault 한다.
   */
  allowNavigate: (href: string) => boolean;
  /**
   * 저장 안 한 변경이 있는지 알린다. 화면마다 key 가 달라야 한다(useUnsavedChanges 가 알아서 준다).
   * 편집기가 여럿 떠 있을 수 있어 불리언 하나가 아니라 key 별로 센다 —
   * 하나가 저장을 끝냈다고 다른 편집기의 dirty 까지 꺼지면 안 된다.
   */
  markDirty: (key: string, dirty: boolean) => void;
  /** 저장 안 한 변경이 하나라도 있는가. */
  dirty: boolean;
}

const Ctx = createContext<SaveGuard | null>(null);

/** 가드 밖에서 불러도 터지지 않는다. 저장은 그대로 되고 이동만 막지 않는다. */
const NOOP: SaveGuard = {
  begin: () => () => {},
  saving: false,
  allowNavigate: () => true,
  markDirty: () => {},
  dirty: false,
};

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

  // 저장 안 한 변경을 가진 화면들. 개수가 아니라 key 를 담는다 —
  // 같은 편집기가 effect 를 두 번 돌려도 중복으로 세지 않게.
  const dirtyKeysRef = useRef<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);

  const markDirty = useCallback((key: string, isDirty: boolean) => {
    const keys = dirtyKeysRef.current;
    if (isDirty) keys.add(key);
    else keys.delete(key);
    setDirty(keys.size > 0);
  }, []);

  // 새로고침·탭 닫기·주소창 이동은 React 가 가로챌 수 없다. 브라우저에게 맡긴다.
  // 저장 중(saving)도 포함한다 — 날아가던 요청이 끊기면 결과가 dirty 와 똑같다.
  //
  // 문구는 정할 수 없다. 최신 브라우저는 사이트가 준 문장을 무시하고 자기 경고를 띄운다.
  // 그래도 "정말 나가시겠습니까" 한 장이 뜨는 것만으로 목적은 달성된다.
  useEffect(() => {
    if (!dirty && !saving) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 옛 브라우저는 returnValue 가 채워져 있어야 경고를 띄운다.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, saving]);

  const allowNavigate = useCallback((href: string) => {
    // 저장 중이면 미루기. 기다리면 끝나므로 묻지 않고 대신 보내 준다.
    if (countRef.current > 0) {
      queuedRef.current = href;
      return false;
    }
    // 저장 안 한 변경이면 미뤄 봐야 저장되지 않는다. 버릴 것인지 묻는다.
    // 가겠다고 하면 그대로 보낸다 — 화면이 사라지면서 편집기가 dirty 표시를 스스로 거둔다.
    if (dirtyKeysRef.current.size > 0) {
      return window.confirm("저장하지 않은 변경이 있습니다. 이 화면을 떠나면 사라집니다. 그래도 이동할까요?");
    }
    return true;
  }, []);

  return <Ctx.Provider value={{ begin, saving, allowNavigate, markDirty, dirty }}>{children}</Ctx.Provider>;
}

/**
 * "이 화면에 저장 안 한 변경이 있다" 를 가드에 알린다.
 *
 *   const dirty = JSON.stringify(questions) !== baselineJson;
 *   useUnsavedChanges(dirty);
 *
 * 화면이 사라지면 자동으로 거둔다. 편집기가 저장을 마치고 dirty 가 false 가 되면 그때도 거둔다.
 */
export function useUnsavedChanges(isDirty: boolean) {
  const { markDirty } = useSaveGuard();
  // 화면마다 다른 key. 편집기 두 개가 동시에 떠도 서로의 표시를 지우지 않는다.
  const key = useId();
  useEffect(() => {
    markDirty(key, isDirty);
    return () => markDirty(key, false);
  }, [markDirty, key, isDirty]);
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
