import { ImageResponse } from "next/og";
import { brandFontConfig, BRAND_FONT_NAME, TILE_BG, TILE_BORDER, TILE_TEXT } from "@/lib/brand-font";

export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

/** 아이폰 홈 화면에 추가했을 때 쓰는 아이콘. */
export default function AppleIcon() {
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
          borderRadius: "40px",
          border: `2px solid ${TILE_BORDER}`,
          color: TILE_TEXT,
          fontFamily: BRAND_FONT_NAME,
          fontSize: "101px",
          fontWeight: 800,
          letterSpacing: "-4.5px",
        }}
      >
        RB
      </div>
    ),
    {
      ...size,
      fonts: brandFontConfig,
    }
  );
}
