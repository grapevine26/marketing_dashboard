import { ImageResponse } from "next/og";
import { brandFontConfig, BRAND_FONT_NAME, TILE_BG, TILE_TEXT } from "@/lib/brand-font";

export const size = {
  width: 32,
  height: 32,
};
export const contentType = "image/png";

/**
 * 브라우저 탭 아이콘. RB Global(레드브릭스)의 머리글자.
 *
 * **작은 아이콘은 큰 아이콘과 비율이 다르다.** 탭에서는 16px 남짓으로 줄어드는데,
 * 그 크기에서는 테두리 1px 과 안쪽 여백이 글자가 쓸 픽셀을 그대로 빼앗는다.
 * 그래서 여기서는 테두리를 빼고 글자를 키웠다. 큰 아이콘은 반대로 여백이 있어야 보기 좋다.
 */
export default function Icon() {
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
          borderRadius: "7px",
          color: TILE_TEXT,
          fontFamily: BRAND_FONT_NAME,
          fontSize: "20px",
          fontWeight: 800,
          letterSpacing: "-0.9px",
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
