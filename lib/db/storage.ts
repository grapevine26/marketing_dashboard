import fs from "fs";
import path from "path";
import os from "os";

/**
 * 저장소 추상화.
 *
 * 백엔드가 둘이다.
 * - 로컬 파일시스템: 개발과 테스트에서 쓴다. 기존 동작을 그대로 유지한다.
 * - Vercel Blob: 배포에서 쓴다. BLOB_READ_WRITE_TOKEN 이 있으면 자동으로 이쪽을 탄다.
 *
 * Vercel 의 서버리스 인스턴스는 저마다 다른 임시 디스크를 갖기 때문에, 파일에 저장하면
 * 인스턴스마다 데이터가 갈린다. 그래서 배포에서는 모든 인스턴스가 같은 Blob 을 보게 한다.
 *
 * 나중에 Supabase 로 옮길 때는 이 파일의 함수 구현만 갈아끼우면 된다.
 */

/** 다른 곳에서 먼저 저장해서 낙관적 잠금(ETag)이 어긋났을 때. 호출자가 다시 시도한다. */
export class ConcurrentWriteError extends Error {
  constructor() {
    super("다른 곳에서 먼저 저장했습니다. 다시 시도합니다.");
    this.name = "ConcurrentWriteError";
  }
}

/** 문서 본문과 그 시점의 버전(Blob은 ETag, 파일은 mtime). 조건부 쓰기에 쓴다. */
export interface DocSnapshot {
  text: string;
  version: string | null;
}

export interface FileRead {
  stream: ReadableStream<Uint8Array>;
  /** 전체 크기. 알 수 없으면 null. */
  size: number | null;
  /** Range 응답일 때만 채워진다. */
  contentRange: string | null;
  status: 200 | 206;
}

const DOC_KEY = "db/marketing_db.json";
const UPLOAD_PREFIX = "uploads/";
const BACKUP_PREFIX = "backups/";

/**
 * Blob 스토어가 연결돼 있는가.
 *
 * Vercel 에 스토어를 연결하면 BLOB_STORE_ID 가 들어가고, 인증은 자동으로 도는
 * OIDC 토큰(VERCEL_OIDC_TOKEN)이 맡는다. 읽기·쓰기 토큰은 선택 사항이라 없을 수 있다.
 * 그래서 둘 중 하나만 있어도 Blob 백엔드로 본다.
 * (토큰만 보고 판단하면 정상 연결된 프로젝트가 임시 디스크로 떨어진다.)
 */
export function isBlobBackend(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

/**
 * 배포 환경인데 Blob 토큰이 없으면 데이터가 조용히 사라진다.
 * 막을 수는 없으니 로그로 크게 남긴다.
 */
function warnIfEphemeral() {
  if (process.env.VERCEL && !isBlobBackend()) {
    console.error(
      "[storage] Blob 스토어가 연결돼 있지 않습니다 (BLOB_STORE_ID / BLOB_READ_WRITE_TOKEN 둘 다 없음). " +
        "서버리스 임시 디스크에 저장되어 인스턴스마다 데이터가 갈리고 곧 사라집니다. " +
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
    localPath: blob ? null : getDbFilePath(),
  };
}

// ---------- 파일시스템 백엔드 경로 (기존 동작 유지) ----------

export function getDbFilePath(): string {
  if (process.env.DB_FILE) return path.resolve(process.env.DB_FILE);
  if (process.env.VERCEL) return path.join(/*turbopackIgnore: true*/ os.tmpdir(), "marketing_db.json");
  return path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "db.json");
}

export function getUploadsDirPath(): string {
  if (process.env.UPLOADS_DIR) return path.resolve(process.env.UPLOADS_DIR);
  if (process.env.DB_FILE) {
    return path.join(/*turbopackIgnore: true*/ path.dirname(path.resolve(process.env.DB_FILE)), "uploads");
  }
  if (process.env.VERCEL) return path.join(/*turbopackIgnore: true*/ os.tmpdir(), "marketing_uploads");
  return path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "uploads");
}

export function getBackupDirPath(): string {
  if (process.env.DB_BACKUP_DIR) return path.resolve(process.env.DB_BACKUP_DIR);
  return path.join(/*turbopackIgnore: true*/ path.dirname(getDbFilePath()), "backups");
}

function ensureDir(dir: string) {
  if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) {
    fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
  }
}

// ---------- 문서 (JSON DB) ----------

export async function readDoc(): Promise<DocSnapshot | null> {
  warnIfEphemeral();

  if (isBlobBackend()) {
    const { get, BlobNotFoundError } = await import("@vercel/blob");
    try {
      // useCache:false — CDN 캐시가 아니라 원본을 읽는다. 오래된 값을 읽으면 덮어쓰기가 난다.
      const res = await get(DOC_KEY, { access: "private", useCache: false });
      if (!res?.stream) return null;
      const text = await new Response(res.stream).text();
      return { text, version: res.blob.etag ?? null };
    } catch (err) {
      if (err instanceof BlobNotFoundError) return null;
      throw err;
    }
  }

  const filePath = getDbFilePath();
  if (!fs.existsSync(/*turbopackIgnore: true*/ filePath)) return null;
  const text = fs.readFileSync(/*turbopackIgnore: true*/ filePath, "utf-8");
  const version = String(fs.statSync(/*turbopackIgnore: true*/ filePath).mtimeMs);
  return { text, version };
}

/**
 * 문서를 저장한다.
 * expectedVersion 을 주면 그 사이 다른 곳에서 바뀌지 않았을 때만 쓴다(낙관적 잠금).
 * 어긋나면 ConcurrentWriteError 를 던진다. null 이면 무조건 덮어쓴다.
 */
export async function writeDoc(text: string, expectedVersion: string | null): Promise<string | null> {
  if (isBlobBackend()) {
    const { put, BlobPreconditionFailedError } = await import("@vercel/blob");
    try {
      const res = await put(DOC_KEY, text, {
        access: "private",
        contentType: "application/json",
        allowOverwrite: true,
        addRandomSuffix: false,
        ...(expectedVersion ? { ifMatch: expectedVersion } : {}),
      });
      return res.etag ?? null;
    } catch (err) {
      if (err instanceof BlobPreconditionFailedError) throw new ConcurrentWriteError();
      throw err;
    }
  }

  const filePath = getDbFilePath();
  ensureDir(path.dirname(filePath));
  // 파일 백엔드는 한 프로세스 안에서만 쓰므로 mtime 비교로 충분하다.
  if (expectedVersion && fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
    const current = String(fs.statSync(/*turbopackIgnore: true*/ filePath).mtimeMs);
    if (current !== expectedVersion) throw new ConcurrentWriteError();
  }
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(/*turbopackIgnore: true*/ tmp, text, "utf-8");
  fs.renameSync(/*turbopackIgnore: true*/ tmp, filePath);
  return String(fs.statSync(/*turbopackIgnore: true*/ filePath).mtimeMs);
}

/**
 * 낙관적 잠금(조건부 쓰기)이 이 스토어에서 실제로 되는지 확인한다.
 *
 * mutateDb 가 쓰는 경로와 같은 primitive 를 임시 키에 대고 돌려본다.
 * put 이 준 ETag 를 get 이 그대로 돌려주지 않으면 ifMatch 가 영원히 어긋나고,
 * 모든 저장이 재시도를 소진한 뒤 실패한다. 그걸 여기서 잡는다.
 */
export async function probeConditionalWrite(): Promise<{
  ok: boolean;
  steps: Record<string, unknown>;
}> {
  const steps: Record<string, unknown> = {};

  if (!isBlobBackend()) {
    return { ok: true, steps: { skipped: "파일 백엔드에서는 mtime 을 쓴다" } };
  }

  const { put, get, del, BlobPreconditionFailedError } = await import("@vercel/blob");
  const key = `probe/conditional-${Date.now()}.json`;

  try {
    const first = await put(key, JSON.stringify({ n: 1 }), {
      access: "private",
      contentType: "application/json",
      allowOverwrite: true,
      addRandomSuffix: false,
    });
    steps.putEtagPresent = Boolean(first.etag);

    const fetched = await get(key, { access: "private", useCache: false });
    const readEtag = fetched?.blob.etag ?? null;
    steps.getEtagPresent = Boolean(readEtag);
    // 여기가 어긋나면 ifMatch 는 절대 통과하지 못한다.
    steps.etagsMatch = first.etag === readEtag;

    if (!readEtag) {
      steps.failedAt = "get 이 ETag 를 주지 않았다";
      return { ok: false, steps };
    }

    const second = await put(key, JSON.stringify({ n: 2 }), {
      access: "private",
      contentType: "application/json",
      allowOverwrite: true,
      addRandomSuffix: false,
      ifMatch: readEtag,
    });
    steps.conditionalWriteAccepted = true;
    steps.etagChangedAfterWrite = second.etag !== readEtag;

    // 이제 readEtag 는 낡았다. 거부되어야 정상이다.
    try {
      await put(key, JSON.stringify({ n: 3 }), {
        access: "private",
        contentType: "application/json",
        allowOverwrite: true,
        addRandomSuffix: false,
        ifMatch: readEtag,
      });
      steps.staleWriteRejected = false;
      steps.failedAt = "낡은 ETag 로 쓴 게 통과했다. 동시 저장이 서로를 덮어쓴다.";
      return { ok: false, steps };
    } catch (err) {
      steps.staleWriteRejected = true;
      steps.staleErrorName = err instanceof Error ? err.name : String(err);
      steps.mappedToConcurrentWriteError = err instanceof BlobPreconditionFailedError;
    }

    return { ok: steps.staleWriteRejected === true && steps.etagsMatch === true, steps };
  } catch (err) {
    steps.failedAt = "예외";
    steps.error = err instanceof Error ? { name: err.name, message: err.message } : String(err);
    return { ok: false, steps };
  } finally {
    try {
      await del(key);
    } catch {
      /* 진단용 임시 키 정리 실패는 무시한다 */
    }
  }
}

/**
 * 진짜 DB 문서에 대고 조건부 쓰기를 재현한다.
 *
 * 임시 키로 한 검사는 통과하는데 실제 저장은 계속 충돌하는 상황을 가르기 위한 것이다.
 * 내용은 방금 읽은 것을 그대로 다시 쓴다. 성공해도 문서는 한 글자도 바뀌지 않는다.
 */
export async function probeDocConditionalWrite(): Promise<{
  ok: boolean;
  steps: Record<string, unknown>;
}> {
  const steps: Record<string, unknown> = {};

  if (!isBlobBackend()) {
    return { ok: true, steps: { skipped: "파일 백엔드" } };
  }

  const { put, BlobPreconditionFailedError } = await import("@vercel/blob");

  try {
    const first = await readDoc();
    if (!first) {
      return { ok: true, steps: { skipped: "아직 DB 문서가 없다" } };
    }
    const second = await readDoc();

    steps.etagStableAcrossReads = second ? first.version === second.version : null;
    steps.etagSample = first.version ? `${first.version.slice(0, 12)}…(${first.version.length}자)` : null;
    steps.bytes = first.text.length;

    if (!first.version) {
      steps.failedAt = "읽기가 ETag 를 주지 않았다";
      return { ok: false, steps };
    }

    // 방금 읽은 그 내용을 그대로, 방금 읽은 ETag 를 조건으로 다시 쓴다.
    try {
      const res = await put(DOC_KEY, first.text, {
        access: "private",
        contentType: "application/json",
        allowOverwrite: true,
        addRandomSuffix: false,
        ifMatch: first.version,
      });
      steps.sameContentWriteAccepted = true;
      steps.etagAfterWrite = res.etag ? `${res.etag.slice(0, 12)}…` : null;
      steps.etagChangedForIdenticalContent = res.etag !== first.version;
      return { ok: true, steps };
    } catch (err) {
      steps.sameContentWriteAccepted = false;
      steps.isPreconditionFailed = err instanceof BlobPreconditionFailedError;
      steps.error = err instanceof Error ? { name: err.name, message: err.message } : String(err);

      // 조건 없이 쓰면 되는지까지는 확인하지 않는다. 진단이 데이터를 건드리면 안 된다.
      steps.note = "실제 문서에서는 조건부 쓰기가 거부된다. 저장 실패의 원인이 여기다.";
      return { ok: false, steps };
    }
  } catch (err) {
    steps.failedAt = "예외";
    steps.error = err instanceof Error ? { name: err.name, message: err.message } : String(err);
    return { ok: false, steps };
  }
}

// ---------- 업로드 파일 (SNS 시안 미디어) ----------

export async function putFile(key: string, buffer: Buffer, contentType: string): Promise<void> {
  if (isBlobBackend()) {
    const { put } = await import("@vercel/blob");
    await put(`${UPLOAD_PREFIX}${key}`, buffer, {
      access: "private",
      contentType,
      allowOverwrite: true,
      addRandomSuffix: false,
    });
    return;
  }
  const dir = getUploadsDirPath();
  ensureDir(dir);
  fs.writeFileSync(/*turbopackIgnore: true*/ path.join(dir, key), buffer);
}

/** 본문을 받지 않고 크기만 본다. Range 검증(416 판별)에 쓴다. */
export async function statFile(key: string): Promise<{ size: number } | null> {
  if (isBlobBackend()) {
    const { head, BlobNotFoundError } = await import("@vercel/blob");
    try {
      const res = await head(`${UPLOAD_PREFIX}${key}`);
      return res ? { size: res.size } : null;
    } catch (err) {
      if (err instanceof BlobNotFoundError) return null;
      throw err;
    }
  }
  const filePath = path.join(/*turbopackIgnore: true*/ getUploadsDirPath(), key);
  if (!fs.existsSync(/*turbopackIgnore: true*/ filePath)) return null;
  return { size: fs.statSync(/*turbopackIgnore: true*/ filePath).size };
}

/** range 를 주면 부분 응답(206)을 돌려준다. 영상 탐색에 쓴다. */
export async function readFile(key: string, range?: string | null): Promise<FileRead | null> {
  if (isBlobBackend()) {
    const { get, BlobNotFoundError } = await import("@vercel/blob");
    try {
      const res = await get(`${UPLOAD_PREFIX}${key}`, {
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

  const filePath = path.join(/*turbopackIgnore: true*/ getUploadsDirPath(), key);
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
export async function findFileKeyByPrefix(prefix: string): Promise<string | null> {
  if (isBlobBackend()) {
    const { list } = await import("@vercel/blob");
    const res = await list({ prefix: `${UPLOAD_PREFIX}${prefix}`, limit: 1 });
    const found = res.blobs[0];
    return found ? found.pathname.slice(UPLOAD_PREFIX.length) : null;
  }
  const dir = getUploadsDirPath();
  if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) return null;
  return fs.readdirSync(/*turbopackIgnore: true*/ dir).find((f) => f.startsWith(prefix)) ?? null;
}

export async function deleteFilesByPrefixes(prefixes: string[]): Promise<void> {
  if (prefixes.length === 0) return;

  if (isBlobBackend()) {
    const { list, del } = await import("@vercel/blob");
    const targets: string[] = [];
    for (const prefix of prefixes) {
      const res = await list({ prefix: `${UPLOAD_PREFIX}${prefix}` });
      targets.push(...res.blobs.map((b) => b.url));
    }
    if (targets.length > 0) await del(targets);
    return;
  }

  const dir = getUploadsDirPath();
  if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) return;
  const files = fs.readdirSync(/*turbopackIgnore: true*/ dir);
  for (const prefix of prefixes) {
    for (const f of files.filter((name) => name.startsWith(prefix))) {
      try {
        fs.unlinkSync(/*turbopackIgnore: true*/ path.join(dir, f));
      } catch {
        /* 이미 지워졌으면 넘어간다 */
      }
    }
  }
}

// ---------- 백업 ----------

export interface BackupEntry {
  file: string;
  size: number;
  created_at: string;
}

export async function listBackups(): Promise<BackupEntry[]> {
  if (isBlobBackend()) {
    const { list } = await import("@vercel/blob");
    const res = await list({ prefix: BACKUP_PREFIX });
    return res.blobs
      .map((b) => ({
        file: b.pathname.slice(BACKUP_PREFIX.length),
        size: b.size,
        created_at: b.uploadedAt.toISOString(),
      }))
      .sort((a, b) => b.file.localeCompare(a.file));
  }

  const dir = getBackupDirPath();
  if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) return [];
  return fs
    .readdirSync(/*turbopackIgnore: true*/ dir)
    .filter((f) => /^db-\d{8}-\d{6}\.json$/.test(f))
    .map((f) => {
      const st = fs.statSync(/*turbopackIgnore: true*/ path.join(dir, f));
      return { file: f, size: st.size, created_at: new Date(st.mtimeMs).toISOString() };
    })
    .sort((a, b) => b.file.localeCompare(a.file));
}

/** 간격 안에 이미 백업이 있으면 건너뛴다. 실제로 백업했으면 true. */
export async function writeBackupIfDue(text: string, intervalMs: number, keep: number): Promise<boolean> {
  const existing = await listBackups();
  if (existing.length > 0) {
    const latest = new Date(existing[0].created_at).getTime();
    if (Date.now() - latest < intervalMs) return false;
  }

  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const name = `db-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes()
  )}${pad(d.getSeconds())}.json`;

  if (isBlobBackend()) {
    const { put, del } = await import("@vercel/blob");
    await put(`${BACKUP_PREFIX}${name}`, text, {
      access: "private",
      contentType: "application/json",
      allowOverwrite: true,
      addRandomSuffix: false,
    });
    const all = await listBackups();
    const stale = all.slice(keep);
    if (stale.length > 0) {
      const { list } = await import("@vercel/blob");
      const res = await list({ prefix: BACKUP_PREFIX });
      const urls = res.blobs
        .filter((b) => stale.some((s) => b.pathname.endsWith(s.file)))
        .map((b) => b.url);
      if (urls.length > 0) await del(urls);
    }
    return true;
  }

  const dir = getBackupDirPath();
  ensureDir(dir);
  fs.writeFileSync(/*turbopackIgnore: true*/ path.join(dir, name), text, "utf-8");
  const all = await listBackups();
  for (const old of all.slice(keep)) {
    try {
      fs.unlinkSync(/*turbopackIgnore: true*/ path.join(dir, old.file));
    } catch {
      /* 무시 */
    }
  }
  return true;
}
