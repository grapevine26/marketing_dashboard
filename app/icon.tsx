import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};
export const contentType = "image/png";

/**
 * 브라우저 탭 아이콘. RB Global(레드브릭스)의 머리글자를 쓴다.
 * 32px 안에 두 글자가 들어가야 해서 글자 크기를 한 글자일 때보다 줄였다.
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
          background: "#16171b",
          borderRadius: "7px",
          border: "1px solid #292b34",
          color: "#ececf1",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          fontSize: "14px",
          fontWeight: 900,
          letterSpacing: "-0.5px",
        }}
      >
        RB
      </div>
    ),
    {
      ...size,
    }
  );
}
