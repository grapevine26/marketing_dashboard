import { NextRequest, NextResponse } from "next/server";
import { getSnsMediaAttachmentById, getSnsAccountById } from "@/lib/db";
import fs from "fs";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const mediaInfo = await getSnsMediaAttachmentById(id);
  if (!mediaInfo || !fs.existsSync(/*turbopackIgnore: true*/ mediaInfo.filePath)) {
    return new NextResponse("Media not found", { status: 404 });
  }

  const { attachment, filePath, accountId } = mediaInfo;

  // Optional token verification if token param is passed
  const token = request.nextUrl.searchParams.get("token");
  if (token) {
    const account = await getSnsAccountById(accountId);
    if (!account || (account.approval_token !== token && account.intake_token !== token)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  const stat = fs.statSync(/*turbopackIgnore: true*/ filePath);
  const fileSize = stat.size;
  const range = request.headers.get("range");

  // Support range requests for video streaming and seeking
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize || isNaN(start)) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${fileSize}` },
      });
    }

    const chunksize = end - start + 1;
    const nodeStream = fs.createReadStream(/*turbopackIgnore: true*/ filePath, { start, end });

    const stream = new ReadableStream({
      start(controller) {
        nodeStream.on("data", (chunk) => controller.enqueue(chunk));
        nodeStream.on("end", () => controller.close());
        nodeStream.on("error", (err) => controller.error(err));
      },
      cancel() {
        nodeStream.destroy();
      },
    });

    return new NextResponse(stream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunksize),
        "Content-Type": attachment.mime_type,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  }

  // Regular full-file response
  const fileBuffer = fs.readFileSync(/*turbopackIgnore: true*/ filePath);
  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": attachment.mime_type,
      "Content-Length": String(fileSize),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.name)}"`,
    },
  });
}
