import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};
export const contentType = "image/png";

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
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "20px",
          fontWeight: 700,
        }}
      >
        M
      </div>
    ),
    {
      ...size,
    }
  );
}
