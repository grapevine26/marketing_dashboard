import { ImageResponse } from "next/og";

export const dynamic = "force-static";

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
          fontSize: "340px",
          fontWeight: 900,
        }}
      >
        M
      </div>
    ),
    {
      width: 512,
      height: 512,
    }
  );
}
