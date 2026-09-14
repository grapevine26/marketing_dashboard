import { ImageResponse } from "next/og";
import { brandFontConfig, BRAND_FONT_NAME, TILE_BG, TILE_BORDER, TILE_TEXT } from "@/lib/brand-font";

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
          background: TILE_BG,
          borderRadius: "115px",
          border: `4px solid ${TILE_BORDER}`,
          color: TILE_TEXT,
          fontFamily: BRAND_FONT_NAME,
          fontSize: "287px",
          fontWeight: 800,
          letterSpacing: "-13px",
        }}
      >
        RB
      </div>
    ),
    {
      width: 512,
      height: 512,
      fonts: brandFontConfig,
    }
  );
}
