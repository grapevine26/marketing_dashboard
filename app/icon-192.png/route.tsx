import { ImageResponse } from "next/og";
import { brandFontConfig, BRAND_FONT_NAME, TILE_BG, TILE_BORDER, TILE_TEXT } from "@/lib/brand-font";

export const dynamic = "force-static";

/** PWA 설치용 192px 아이콘. 크롬은 설치 버튼을 띄우기 전에 이 크기를 확인한다. */
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
          background: TILE_BG,
          borderRadius: "44px",
          border: `2px solid ${TILE_BORDER}`,
          color: TILE_TEXT,
          fontFamily: BRAND_FONT_NAME,
          fontSize: "108px",
          fontWeight: 800,
          letterSpacing: "-4.9px",
        }}
      >
        RB
      </div>
    ),
    {
      width: 192,
      height: 192,
      fonts: brandFontConfig,
    }
  );
}
