import { ImageResponse } from "next/og";

export const dynamic = "force-static";

/** PWA 설치용 512px 아이콘. 안드로이드 스플래시와 앱 목록에서 쓴다. */
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
          borderRadius: "115px",
          border: "4px solid #292b34",
          color: "#ececf1",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          fontSize: "222px",
          fontWeight: 900,
          letterSpacing: "-8px",
        }}
      >
        RB
      </div>
    ),
    {
      width: 512,
      height: 512,
    }
  );
}
