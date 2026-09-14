import { ImageResponse } from "next/og";

export const dynamic = "force-static";

/**
 * PWA 설치용 192px 아이콘. 크롬은 설치 버튼을 띄우기 전에 이 크기를 확인한다.
 * RB Global(레드브릭스)의 머리글자라 두 글자가 들어간다. 한 글자일 때보다 글자를 줄였다.
 */
export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#16171b",
          borderRadius: "44px",
          border: "2px solid #292b34",
          color: "#ececf1",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          fontSize: "84px",
          fontWeight: 900,
          letterSpacing: "-3px",
        }}
      >
        RB
      </div>
    ),
    {
      width: 192,
      height: 192,
    }
  );
}
