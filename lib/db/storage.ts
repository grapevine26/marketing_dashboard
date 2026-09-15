import fs from "fs";
import path from "path";
import os from "os";
import { UPLOAD_PREFIX as SHARED_UPLOAD_PREFIX, TEMPLATE_PREFIX as SHARED_TEMPLATE_PREFIX } from "./types";

/**
 * 파일 저장소 추상화. (DB 는 Supabase Postgres 라 여기서 다루지 않는다.)
 *
 * 백엔드가 둘이다.
 * - 로컬 파일시스템: 개발과 테스트에서 쓴다.
 * - Vercel Blob: 배포에서 쓴다. BLOB_STORE_ID 나 BLOB_READ_WRITE_TOKEN 이 있으면 자동으로 이쪽을 탄다.
 *
 * Vercel 의 서버리스 인스턴스는 저마다 다른 임시 디스크를 갖기 때문에, 파일에 저장하면
 * 인스턴스마다 데이터가 갈린다. 그래서 배포에서는 모든 인스턴스가 같은 Blob 을 보게 한다.
 *
 * 나중에 Supabase Storage 로 옮길 때는 이 파일의 함수 구현만 갈아끼우면 된다.
 */

export interface FileRead {
  stream: ReadableStream<Uint8Array>;
  /** 전체 크기. 알 수 없으면 null. */
  size: number | null;
  /** Range 응답일 때만 채워진다. */
  contentRange: string | null;
  status: 200 | 206;
}

const UPLOAD_PREFIX = SHARED_UPLOAD_PREFIX;
const TEMPLATE_PREFIX = SHARED_TEMPLATE_PREFIX;

/**
 * 저장소 안의 갈래.
 * - uploads: SNS 시안 미디어
 * - templates: 업로드된 PPT 템플릿
 * - backups: 크론이 매일 받아두는 DB 덤프 (JSON)
 */
export type FileScope = "uploads" | "templates" | "backups";

const BACKUP_PREFIX = "backups/";

function prefixOf(scope: FileScope): string {
  if (scope === "templates") return TEMPLATE_PREFIX;
  if (scope === "backups") return BACKUP_PREFIX;
  return UPLOAD_PREFIX;
}

function dirOf(scope: FileScope): string {
  if (scope === "uploads") return getUploadsDirPath();
  return path.join(/*turbopackIgnore: true*/ path.dirname(getUploadsDirPath()), scope);
}

/**
 * Blob 스토어가 연결돼 있는가.
 *
 * Vercel 에 스토어를 연결하면 BLOB_STORE_ID 가 들어가고, 인증은 자동으로 도는
 * OIDC 토큰(VERCEL_OIDC_TOKEN)이 맡는다. 읽기·쓰기 토큰은 선택 사항이라 없을 수 있다.
 * 그래서 둘 중 하나만 있어도 Blob 백엔드로 본다.
 */
export function isBlobBackend(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

/**
 * 배포 환경인데 Blob 토큰이 없으면 파일이 조용히 사라진다.
 * 막을 수는 없으니 로그로 크게 남긴다.
 */
function warnIfEphemeral() {
  if (process.env.VERCEL && !isBlobBackend()) {
    console.error(
      "[storage] Blob 스토어가 연결돼 있지 않습니다 (BLOB_STORE_ID / BLOB_READ_WRITE_TOKEN 둘 다 없음). " +
        "첨부 파일이 서버리스 임시 디스크에 저장되어 인스턴스마다 갈리고 곧 사라집니다. " +
        "Vercel 프로젝트에 Blob 스토어를 연결하세요."
    );
  }
}

/** 진단용. 값은 절대 담지 않는다. 어떤 변수가 있는지만 본다. */
export function describeStorage(): {
  backend: "blob" | "file";
  onVercel: boolean;
  hasStoreId: boolean;
  hasReadWriteToken: boolean;
  hasOidcToken: boolean;
  localPath: string | null;
} {
  const blob = isBlobBackend();
  return {
    backend: blob ? "blob" : "file",
    onVercel: Boolean(process.env.VERCEL),
    hasStoreId: Boolean(process.env.BLOB_STORE_ID),
    hasReadWriteToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    hasOidcToken: Boolean(process.env.VERCEL_OIDC_TOKEN),
    localPath: blob ? null : getUploadsDirPath(),
  };
}

// ---------- 파일시스템 백엔드 경로 ----------

export function getUploadsDirPath(): string {
  if (process.env.UPLOADS_DIR) return path.resolve(process.env.UPLOADS_DIR);
  if (process.env.VERCEL) return path.join(/*turbopackIgnore: true*/ os.tmpdir(), "marketing_uploads");
  return path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "uploads");
}

function ensureDir(dir: string) {
  if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) {
    fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
  }
}

// ---------- 업로드 파일 ----------

/**
 * 업로드 키의 실제 저장 경로. 브라우저가 Blob 에 직접 올릴 때 이 경로를 써야
 * readFile / findFileKeyByPrefix 가 같은 파일을 찾는다.
 */
export function uploadPathname(key: string): string {
  return `${UPLOAD_PREFIX}${key}`;
}

export async function putFile(
  key: string,
  buffer: Buffer,
  contentType: string,
  scope: FileScope = "uploads"
): Promise<void> {
  warnIfEphemeral();
  if (isBlobBackend()) {
    const { put } = await import("@vercel/blob");
    await put(`${prefixOf(scope)}${key}`, buffer, {
      access: "private",
      contentType,
      allowOverwrite: true,
      addRandomSuffix: false,
    });
    return;
  }
  const dir = dirOf(scope);
  ensureDir(dir);
  fs.writeFileSync(/*turbopackIgnore: true*/ path.join(dir, key), buffer);
}

/** 본문을 받지 않고 크기만 본다. Range 검증(416 판별)에 쓴다. */
export async function statFile(key: string, scope: FileScope = "uploads"): Promise<{ size: number } | null> {
  if (isBlobBackend()) {
    const { head, BlobNotFoundError } = await import("@vercel/blob");
    try {
      const res = await head(`${prefixOf(scope)}${key}`);
      return res ? { size: res.size } : null;
    } catch (err) {
      if (err instanceof BlobNotFoundError) return null;
      throw err;
    }
  }
  const filePath = path.join(/*turbopackIgnore: true*/ dirOf(scope), key);
  if (!fs.existsSync(/*turbopackIgnore: true*/ filePath)) return null;
  return { size: fs.statSync(/*turbopackIgnore: true*/ filePath).size };
}

/** range 를 주면 부분 응답(206)을 돌려준다. 영상 탐색에 쓴다. */
export async function readFile(
  key: string,
  range?: string | null,
  scope: FileScope = "uploads"
): Promise<FileRead | null> {
  if (isBlobBackend()) {
    const { get, BlobNotFoundError } = await import("@vercel/blob");
    try {
      const res = await get(`${prefixOf(scope)}${key}`, {
        access: "private",
        ...(range ? { headers: { Range: range } } : {}),
      });
      if (!res?.stream) return null;
      const contentRange = res.headers?.get("content-range") ?? null;
      const len = res.headers?.get("content-length");
      return {
        stream: res.stream as ReadableStream<Uint8Array>,
        size: len ? Number(len) : null,
        contentRange,
        status: contentRange ? 206 : 200,
      };
    } catch (err) {
      if (err instanceof BlobNotFoundError) return null;
      throw err;
    }
  }

  const filePath = path.join(/*turbopackIgnore: true*/ dirOf(scope), key);
  if (!fs.existsSync(/*turbopackIgnore: true*/ filePath)) return null;
  const fileSize = fs.statSync(/*turbopackIgnore: true*/ filePath).size;

  let start = 0;
  let end = fileSize - 1;
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    start = parseInt(parts[0], 10);
    end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    if (Number.isNaN(start) || start >= fileSize || end >= fileSize || start > end) return null;
  }

  const nodeStream = fs.createReadStream(/*turbopackIgnore: true*/ filePath, { start, end });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk) => controller.enqueue(chunk as Uint8Array));
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  return range
    ? { stream, size: end - start + 1, contentRange: `bytes ${start}-${end}/${fileSize}`, status: 206 }
    : { stream, size: fileSize, contentRange: null, status: 200 };
}

/** attachmentId 로 시작하는 실제 저장 키를 찾는다 (확장자를 모르기 때문). */
export async function findFileKeyByPrefix(prefix: string, scope: FileScope = "uploads"): Promise<string | null> {
  if (isBlobBackend()) {
    const { list } = await import("@vercel/blob");
    const res = await list({ prefix: `${prefixOf(scope)}${prefix}`, limit: 1 });
    const found = res.blobs[0];
    return found ? found.pathname.slice(prefixOf(scope).length) : null;
  }
  const dir = dirOf(scope);
  if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) return null;
  return fs.readdirSync(/*turbopackIgnore: true*/ dir).find((f) => f.startsWith(prefix)) ?? null;
}

export interface StoredFile {
  key: string;
  size: number;
  uploadedAt: string;
}

/** 한 갈래의 파일을 전부 나열한다. 백업 보관 개수를 유지하는 데 쓴다. */
export async function listFiles(scope: FileScope): Promise<StoredFile[]> {
  if (isBlobBackend()) {
    const { list } = await import("@vercel/blob");
    const prefix = prefixOf(scope);
    const out: StoredFile[] = [];
    let cursor: string | undefined;
    do {
      const res = await list({ prefix, cursor });
      for (const b of res.blobs) {
        out.push({ key: b.pathname.slice(prefix.length), size: b.size, uploadedAt: b.uploadedAt.toISOString() });
      }
      cursor = res.hasMore ? res.cursor : undefined;
    } while (cursor);
    return out.sort((a, b) => b.key.localeCompare(a.key));
  }

  const dir = dirOf(scope);
  if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) return [];
  return fs
    .readdirSync(/*turbopackIgnore: true*/ dir)
    .map((f) => {
      const st = fs.statSync(/*turbopackIgnore: true*/ path.join(dir, f));
      return { key: f, size: st.size, uploadedAt: new Date(st.mtimeMs).toISOString() };
    })
    .sort((a, b) => b.key.localeCompare(a.key));
}

/**
 * 접두사로 파일을 지운다.
 *
 * **빈 문자열이 하나라도 섞이면 그 폴더 전체가 지워진다.** 지금 부르는 쪽은 전부 UUID 를 넘기지만,
 * 결과가 전멸이라 여기서 막는다. 실수 한 번으로 시안 파일이 전부 사라지는 것보다,
 * 짧은 접두사를 거부해 파일이 남는 쪽이 낫다.
 */
export async function deleteFilesByPrefixes(prefixes: string[], scope: FileScope = "uploads"): Promise<void> {
  // 빈 접두사를 걸러낸다. 하나라도 섞이면 그 폴더의 파일이 전부 지워진다.
  // 길이 하한을 두지는 않는다. 여기는 범용 저장소 도우미고, "얼마나 짧으면 위험한가" 는
  // 부르는 쪽이 정할 일이다. 확실히 파괴적인 경우만 막는다.
  const safe = prefixes.filter((p) => typeof p === "string" && p.trim().length > 0);
  if (safe.length !== prefixes.length) {
    console.error("[storage] 빈 접두사가 들어와 무시했습니다. 부르는 쪽을 확인하세요.");
  }
  if (safe.length === 0) return;

  if (isBlobBackend()) {
    const { list, del } = await import("@vercel/blob");
    const targets: string[] = [];
    for (const prefix of safe) {
      const res = await list({ prefix: `${prefixOf(scope)}${prefix}` });
      targets.push(...res.blobs.map((b) => b.url));
    }
    if (targets.length > 0) await del(targets);
    return;
  }

  const dir = dirOf(scope);
  if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) return;
  const files = fs.readdirSync(/*turbopackIgnore: true*/ dir);
  for (const prefix of safe) {
    for (const f of files.filter((name) => name.startsWith(prefix))) {
      try {
        fs.unlinkSync(/*turbopackIgnore: true*/ path.join(dir, f));
      } catch {
        /* 이미 지워졌으면 넘어간다 */
      }
    }
  }
}
