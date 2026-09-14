import { db, unwrap, unwrapMaybe } from "./client";
import { insertAuditLog } from "./audit";
import { rowToPptTemplate, type PptTemplateRow } from "./mappers";
import { ValidationError, isUuid, nowIso, oneOf, requireText } from "./validation";
import { allBuiltinTemplates, builtinTemplate, isBuiltinTemplateId } from "./defaults";
import { deleteFilesByPrefixes, putFile, readFile, statFile } from "./storage";
import {
  MAX_PPT_TEMPLATE_BYTES,
  buildTemplatePathname,
  templateStorageKey,
  type PptTemplate,
} from "./types";
import { generateDefaultPptBuffer } from "../ppt/engine";

/**
 * 공유 PPT 템플릿 (행사 운영안 · SNS 제안서 · 결과보고서가 함께 쓴다).
 *
 * 저장 구조가 두 갈래다.
 * - 내장 템플릿 3개는 DB 에 없다. `defaults.ts` 가 코드로 만들고, 읽을 때 목록 앞에 합친다.
 *   사용자가 지운 내장 템플릿의 id 만 `hidden_builtin_templates` 에 남긴다.
 * - 업로드한 템플릿은 `ppt_templates` 행 하나 + 파일 저장소(`templates/` 갈래)의 pptx 하나다.
 *   파일 바이너리는 DB 에 넣지 않는다. 옛 base64(`file_data`) 데이터는 옮길 것이 없어 읽지 않는다.
 *
 * 파일과 행은 트랜잭션으로 묶이지 않는다. 순서로 정합성을 지킨다.
 * - 등록: 파일을 먼저 올리고 행을 넣는다. 행 삽입이 실패하면 파일을 치운다.
 * - 교체: 새 키로 올린 뒤 행이 새 키를 가리키게 하고, 그 다음에 옛 파일을 지운다.
 * - 삭제: 행을 지운 뒤 파일을 지운다. 파일 삭제가 실패해도 DB 는 이미 정합하다.
 */

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** 저장소 키. 교체본은 `<id>-<버전>.pptx` 다. */
const TEMPLATE_KEY_RE = /^[0-9a-f-]{36}(-\d{1,20})?\.pptx$/i;

const TABLE = "ppt_templates";
const HIDDEN_TABLE = "hidden_builtin_templates";

// ---------- 내부 헬퍼 ----------

/** pptx 인지 앞부분만 보고 판단한다. zip 컨테이너라 PK 로 시작한다. */
function looksLikePptx(head: Buffer): boolean {
  return head.length >= 4 && head.toString("latin1", 0, 2) === "PK";
}

function validatePptTemplateMeta(kindRaw: PptTemplate["kind"], nameRaw: string) {
  return {
    kind: oneOf(kindRaw, ["event", "sns", "report"] as const, "템플릿 종류"),
    name: requireText(nameRaw, "템플릿 이름", 200),
  };
}

/** 특정 키 하나만 지운다. 교체할 때 옛 파일을 치우는 용도. */
async function purgeTemplateKey(fileKey: string): Promise<void> {
  try {
    await deleteFilesByPrefixes([fileKey], "templates");
  } catch (err) {
    console.warn("[storage] 옛 템플릿 파일 삭제 실패:", err);
  }
}

/** 템플릿 파일 삭제. DB 커밋이 끝난 뒤에 부른다. 실패해도 DB 는 이미 정합하다. */
async function purgeTemplateFile(templateId: string): Promise<void> {
  try {
    await deleteFilesByPrefixes([templateId], "templates");
  } catch (err) {
    console.warn("[storage] 템플릿 파일 삭제 실패 (DB는 정상 반영됨):", err);
  }
}

/** 사용자가 지운 내장 템플릿 id 집합. */
async function hiddenBuiltinIds(): Promise<Set<string>> {
  const rows = unwrap(
    await db().from(HIDDEN_TABLE).select("template_id").returns<{ template_id: string }[]>()
  );
  return new Set(rows.map((r) => r.template_id));
}

async function isBuiltinHidden(id: string): Promise<boolean> {
  const row = unwrapMaybe(
    await db()
      .from(HIDDEN_TABLE)
      .select("template_id")
      .eq("template_id", id)
      .maybeSingle<{ template_id: string }>()
  );
  return row !== null;
}

/** 저장소에서 파일 전체를 읽는다. 없으면 null. */
async function readWholeFile(fileKey: string): Promise<Buffer | null> {
  const res = await readFile(fileKey, null, "templates");
  if (!res) return null;
  return Buffer.from(await new Response(res.stream).arrayBuffer());
}

/** 앞 12바이트만 읽어 pptx 서명을 확인한다. 파일이 없거나 읽을 수 없으면 null. */
async function readFileHead(fileKey: string): Promise<Buffer | null> {
  const head = await readFile(fileKey, "bytes=0-11", "templates");
  if (!head) return null;
  return Buffer.from(await new Response(head.stream).arrayBuffer());
}

// ---------- 조회 ----------

/** 내장(지운 것 제외, defaults 순서) 뒤에 업로드본(uploaded_at 오름차순)을 붙인다. */
const KIND_LABEL: Record<PptTemplate["kind"], string> = {
  event: "행사 운영안",
  sns: "SNS 제안서",
  report: "결과보고서",
};

/**
 * 템플릿은 캠페인·계정에 매이지 않는 공용 자원이라 campaign_id·account_id 가 없다.
 * entity_type 은 스키마가 허용하는 값 중 가장 가까운 campaign 을 쓴다.
 */
async function logTemplate(id: string, action: string, summary: string) {
  await insertAuditLog({
    entity_type: "campaign",
    entity_id: id,
    action,
    actor_type: "agency",
    summary,
  });
}

export async function getPptTemplates(kind?: PptTemplate["kind"]): Promise<PptTemplate[]> {
  const hidden = await hiddenBuiltinIds();
  const builtins = allBuiltinTemplates().filter((t) => !hidden.has(t.id));

  let q = db().from(TABLE).select("*").order("uploaded_at", { ascending: true });
  if (kind) q = q.eq("kind", kind);
  const rows = unwrap(await q.returns<PptTemplateRow[]>());

  const uploaded = rows.map(rowToPptTemplate);
  return kind ? [...builtins.filter((t) => t.kind === kind), ...uploaded] : [...builtins, ...uploaded];
}

export async function getPptTemplateById(id: string): Promise<PptTemplate | null> {
  if (isBuiltinTemplateId(id)) {
    return (await isBuiltinHidden(id)) ? null : builtinTemplate(id);
  }
  if (!isUuid(id)) return null;
  const row = unwrapMaybe(
    await db().from(TABLE).select("*").eq("id", id).maybeSingle<PptTemplateRow>()
  );
  return row ? rowToPptTemplate(row) : null;
}

/** 템플릿의 실제 pptx 바이너리. 내장 템플릿은 코드에서 생성한다. 없으면 null. */
export async function getPptTemplateBuffer(template: PptTemplate): Promise<Buffer | null> {
  if (template.builtin) {
    return generateDefaultPptBuffer(template.kind);
  }
  if (template.file_key) {
    return readWholeFile(template.file_key);
  }
  return null;
}

// ---------- 등록 (서버 경유 업로드) ----------

export async function savePptTemplate(data: {
  kind: PptTemplate["kind"];
  name: string;
  file_buffer: Buffer;
  placeholders: string[];
}): Promise<PptTemplate> {
  const { kind, name } = validatePptTemplateMeta(data.kind, data.name);
  if (!data.file_buffer || !looksLikePptx(data.file_buffer)) {
    throw new ValidationError("올바른 .pptx 파일이 아닙니다.");
  }
  if (data.file_buffer.length > MAX_PPT_TEMPLATE_BYTES) {
    throw new ValidationError("템플릿 파일은 15MB 이하만 업로드할 수 있습니다.");
  }

  const id = crypto.randomUUID();
  const fileKey = templateStorageKey(id);
  await putFile(fileKey, data.file_buffer, PPTX_MIME, "templates");

  try {
    const row = unwrap(
      await db()
        .from(TABLE)
        .insert({ id, kind, name, file_key: fileKey, placeholders: data.placeholders, uploaded_at: nowIso() })
        .select("*")
        .single<PptTemplateRow>()
    );
    await logTemplate(row.id, "ppt_template.uploaded", `[${row.name}] ${KIND_LABEL[row.kind]} 템플릿을 올렸습니다.`);
    return rowToPptTemplate(row);
  } catch (err) {
    // 행이 없는 파일은 아무도 못 찾는다. 남기지 않는다.
    await purgeTemplateFile(id);
    throw err;
  }
}

// ---------- 등록 (브라우저 직접 업로드) ----------

/**
 * 브라우저가 저장소에 pptx 를 직접 올리기 전에 서버가 자리를 잡아준다.
 * Vercel 함수의 4.5MB 본문 한도 때문에 파일이 서버를 거치면 안 된다.
 */
export async function preparePptTemplateUpload(
  kind: PptTemplate["kind"],
  name: string
): Promise<{ templateId: string; fileKey: string; pathname: string }> {
  validatePptTemplateMeta(kind, name);
  const templateId = crypto.randomUUID();
  return {
    templateId,
    fileKey: templateStorageKey(templateId),
    pathname: buildTemplatePathname(templateId),
  };
}

/**
 * 브라우저가 올린 pptx 를 템플릿으로 등록한다.
 * 파일이 서버를 거치지 않았으므로 실물과 앞부분 바이트를 여기서 확인한다.
 */
export async function recordUploadedPptTemplate(input: {
  templateId: string;
  kind: PptTemplate["kind"];
  name: string;
  placeholders: string[];
}): Promise<PptTemplate> {
  const { kind, name } = validatePptTemplateMeta(input.kind, input.name);
  if (!isUuid(input.templateId)) {
    throw new ValidationError("잘못된 업로드 요청입니다.");
  }

  const fileKey = templateStorageKey(input.templateId);
  const stat = await statFile(fileKey, "templates");
  if (!stat) {
    throw new ValidationError("업로드된 파일을 찾을 수 없습니다. 다시 시도해주세요.");
  }
  if (stat.size > MAX_PPT_TEMPLATE_BYTES || stat.size <= 0) {
    await purgeTemplateFile(input.templateId);
    throw new ValidationError("템플릿 파일은 15MB 이하만 업로드할 수 있습니다.");
  }

  const head = await readFileHead(fileKey);
  if (!head) {
    await purgeTemplateFile(input.templateId);
    throw new ValidationError("업로드된 파일을 읽을 수 없습니다. 다시 시도해주세요.");
  }
  if (!looksLikePptx(head)) {
    await purgeTemplateFile(input.templateId);
    throw new ValidationError("올바른 .pptx 파일이 아닙니다.");
  }

  try {
    const row = unwrap(
      await db()
        .from(TABLE)
        .insert({
          id: input.templateId,
          kind,
          name,
          file_key: fileKey,
          placeholders: input.placeholders,
          uploaded_at: nowIso(),
        })
        .select("*")
        .single<PptTemplateRow>()
    );
    await logTemplate(row.id, "ppt_template.uploaded", `[${row.name}] ${KIND_LABEL[row.kind]} 템플릿을 올렸습니다.`);
    return rowToPptTemplate(row);
  } catch (err) {
    await purgeTemplateFile(input.templateId);
    throw err;
  }
}

/**
 * 아직 등록되지 않은, 방금 올라온 템플릿 파일을 읽는다.
 * 치환 항목({{...}})을 뽑으려면 파일 전체가 필요해서 여기서만 통째로 읽는다.
 * 함수 안에서 저장소를 읽는 것이므로 요청 본문 한도와는 무관하다.
 */
export async function readUploadedPptTemplateBuffer(templateId: string): Promise<Buffer | null> {
  if (!isUuid(templateId)) return null;
  return readPptTemplateFileByKey(templateStorageKey(templateId));
}

/** 저장소 키로 직접 읽는다. 파일 교체는 `<id>-<버전>.pptx` 키를 쓰기 때문에 필요하다. */
export async function readPptTemplateFileByKey(fileKey: string): Promise<Buffer | null> {
  if (!TEMPLATE_KEY_RE.test(fileKey)) return null;
  return readWholeFile(fileKey);
}

/** 등록되지 않은 채 남은 업로드 파일을 치운다. */
export async function discardUploadedPptTemplate(templateId: string): Promise<void> {
  await purgeTemplateFile(templateId);
}

// ---------- 수정 ----------

/**
 * 템플릿의 이름과 종류를 바꾼다. 파일은 그대로라 이 템플릿을 쓰던 운영안이 끊기지 않는다.
 * 내장 템플릿이면 ValidationError, 없으면 null.
 */
export async function updatePptTemplateMeta(
  id: string,
  patch: { name?: string; kind?: PptTemplate["kind"] }
): Promise<PptTemplate | null> {
  if (isBuiltinTemplateId(id)) {
    throw new ValidationError("기본 내장 템플릿은 이름과 종류를 바꿀 수 없습니다.");
  }
  if (!isUuid(id)) return null;

  const fields: { name?: string; kind?: PptTemplate["kind"] } = {};
  if (patch.name !== undefined) fields.name = requireText(patch.name, "템플릿 이름", 200);
  if (patch.kind !== undefined) {
    fields.kind = oneOf(patch.kind, ["event", "sns", "report"] as const, "템플릿 종류");
  }
  // 바꿀 것이 없으면 update 를 보내지 않는다. 빈 update 는 PostgREST 가 거부한다.
  if (Object.keys(fields).length === 0) return getPptTemplateById(id);

  const row = unwrapMaybe(
    await db().from(TABLE).update(fields).eq("id", id).select("*").maybeSingle<PptTemplateRow>()
  );
  if (!row) return null;
  await logTemplate(row.id, "ppt_template.updated", `[${row.name}] 템플릿 정보를 수정했습니다. (${KIND_LABEL[row.kind]})`);
  return rowToPptTemplate(row);
}

// ---------- 파일 교체 ----------
// 파일만 갈아끼운다. 템플릿 id 가 그대로라, 이 템플릿을 쓰던 행사·SNS 운영안이 계속 붙어 있다.
// 지웠다 새로 올리면 id 가 바뀌어 그 연결이 전부 끊긴다.

/** 로컬 개발처럼 파일이 서버를 거쳐 올 때, 지정된 키로 그대로 저장한다. */
export async function putPptTemplateReplacement(fileKey: string, buffer: Buffer): Promise<void> {
  if (!TEMPLATE_KEY_RE.test(fileKey)) {
    throw new ValidationError("잘못된 교체 요청입니다.");
  }
  if (!looksLikePptx(buffer)) throw new ValidationError("올바른 .pptx 파일이 아닙니다.");
  if (buffer.length > MAX_PPT_TEMPLATE_BYTES) {
    throw new ValidationError("템플릿 파일은 15MB 이하만 업로드할 수 있습니다.");
  }
  await putFile(fileKey, buffer, PPTX_MIME, "templates");
}

export async function preparePptTemplateReplace(
  templateId: string
): Promise<{ fileKey: string; pathname: string }> {
  const t = await getPptTemplateById(templateId);
  if (!t) throw new ValidationError("템플릿을 찾을 수 없습니다.");
  if (t.builtin) throw new ValidationError("기본 내장 템플릿은 파일을 바꿀 수 없습니다.");

  // 쓰고 있는 키를 덮어쓰지 않는다. 교체가 실패해도 기존 파일이 살아 있어야 한다.
  const version = Date.now();
  return { fileKey: templateStorageKey(templateId, version), pathname: buildTemplatePathname(templateId, version) };
}

export async function recordReplacedPptTemplate(input: {
  templateId: string;
  fileKey: string;
  placeholders: string[];
}): Promise<PptTemplate> {
  if (!TEMPLATE_KEY_RE.test(input.fileKey)) {
    throw new ValidationError("잘못된 교체 요청입니다.");
  }
  if (!input.fileKey.startsWith(input.templateId)) {
    throw new ValidationError("잘못된 교체 요청입니다.");
  }

  const stat = await statFile(input.fileKey, "templates");
  if (!stat) throw new ValidationError("업로드된 파일을 찾을 수 없습니다. 다시 시도해주세요.");
  if (stat.size > MAX_PPT_TEMPLATE_BYTES || stat.size <= 0) {
    await purgeTemplateKey(input.fileKey);
    throw new ValidationError("템플릿 파일은 15MB 이하만 업로드할 수 있습니다.");
  }
  const head = await readFileHead(input.fileKey);
  if (!head || !looksLikePptx(head)) {
    await purgeTemplateKey(input.fileKey);
    throw new ValidationError("올바른 .pptx 파일이 아닙니다.");
  }

  // update 전에 옛 키를 알아둔다. 행이 새 키를 가리킨 다음에야 옛 파일을 지울 수 있다.
  const existing = await getPptTemplateById(input.templateId);
  if (!existing) throw new ValidationError("템플릿을 찾을 수 없습니다.");
  if (existing.builtin) throw new ValidationError("기본 내장 템플릿은 파일을 바꿀 수 없습니다.");
  const previousKey = existing.file_key ?? null;

  const row = unwrap(
    await db()
      .from(TABLE)
      .update({ file_key: input.fileKey, placeholders: input.placeholders, uploaded_at: nowIso() })
      .eq("id", input.templateId)
      .select("*")
      .single<PptTemplateRow>()
  );

  // 기록이 새 파일을 가리킨 다음에 옛 파일을 지운다.
  if (previousKey && previousKey !== input.fileKey) await purgeTemplateKey(previousKey);

  await logTemplate(row.id, "ppt_template.replaced", `[${row.name}] 템플릿 파일을 교체했습니다. 이 템플릿을 쓰던 운영안은 그대로 이어집니다.`);
  return rowToPptTemplate(row);
}

// ---------- 내장 템플릿 숨김/복원 ----------

/** 지워서 목록에 없는 기본 내장 템플릿 수. 되살리기 버튼을 보여줄지 정하는 데 쓴다. */
export async function getHiddenBuiltinTemplateCount(): Promise<number> {
  const res = await db().from(HIDDEN_TABLE).select("template_id", { count: "exact", head: true });
  unwrap(res); // 에러만 확인한다. head 요청이라 data 는 없다.
  return res.count ?? 0;
}

/** 지웠던 기본 내장 템플릿을 모두 되살린다. 되살린 수를 돌려준다. */
export async function restoreBuiltinPptTemplates(): Promise<number> {
  const count = await getHiddenBuiltinTemplateCount();
  if (count === 0) return 0;
  // 전체 삭제. PostgREST 는 필터 없는 delete 를 막을 수 있어 항상 참인 조건을 붙인다.
  unwrap(await db().from(HIDDEN_TABLE).delete().not("template_id", "is", null));
  await logTemplate("builtin", "ppt_template.builtins_restored", `지웠던 기본 내장 템플릿 ${count}개를 되살렸습니다.`);
  return count;
}

// ---------- 삭제 ----------

export async function deletePptTemplate(id: string): Promise<boolean> {
  if (isBuiltinTemplateId(id)) {
    // 내장 템플릿은 코드에서 매번 채워 넣으므로, 지웠다는 사실을 남겨야 되살아나지 않는다.
    // 저장소에 파일은 없다. 코드에서 만들어 쓴다.
    unwrap(
      await db()
        .from(HIDDEN_TABLE)
        .upsert({ template_id: id }, { onConflict: "template_id", ignoreDuplicates: true })
    );
    const builtin = builtinTemplate(id);
    await logTemplate(id, "ppt_template.builtin_hidden", `[${builtin?.name ?? "기본 템플릿"}] 기본 내장 템플릿을 목록에서 지웠습니다. 되살릴 수 있습니다.`);
    return true;
  }
  if (!isUuid(id)) return false;

  const removed = unwrap(
    await db().from(TABLE).delete().eq("id", id).select("*").returns<PptTemplateRow[]>()
  );
  if (removed.length === 0) return false;

  await logTemplate(id, "ppt_template.deleted", `[${removed[0].name}] 템플릿을 삭제했습니다. 이 템플릿을 쓰던 운영안은 PPT 를 받을 수 없습니다.`);

  // 행이 지워진 다음에 파일을 지운다. id 접두사라 교체본(`<id>-<버전>.pptx`)까지 함께 치운다.
  await purgeTemplateFile(id);
  return true;
}
