import { describe, it, expect } from "vitest";
import {
  savePptTemplate,
  getPptTemplates,
  getPptTemplateById,
  getPptTemplateBuffer,
  deletePptTemplate,
  updatePptTemplateMeta,
  preparePptTemplateReplace,
  recordReplacedPptTemplate,
  restoreBuiltinPptTemplates,
  getHiddenBuiltinTemplateCount,
  preparePptTemplateUpload,
  recordUploadedPptTemplate,
  readUploadedPptTemplateBuffer,
  mutateDb,
  ValidationError,
} from "@/lib/db";
import { putFile, statFile, readDoc } from "@/lib/db/storage";
import { buildTemplatePathname } from "@/lib/db/types";

/** 최소한의 zip 컨테이너 흉내. pptx 는 PK 로 시작한다. */
const pptxBytes = (size: number, filler = "A") => {
  const buf = Buffer.alloc(size, filler.charCodeAt(0));
  buf.write("PK", 0, "latin1");
  return buf;
};

/**
 * PPT 템플릿 파일은 DB 문서 밖에 둔다.
 *
 * 예전에는 base64 로 문서 안에 넣었다. 그러면 10MB 템플릿 하나에 문서가 14MB 가 되고,
 * 그때부터 모든 저장이 매번 그 14MB 를 읽고 다시 쓴다. 그걸 막는 게 이 테스트의 목적이다.
 */
describe("PPT 템플릿 저장", () => {
  it("파일이 DB 문서를 키우지 않는다", async () => {
    // 문서를 먼저 만들어 둔다. 안 그러면 첫 저장이 문서 전체를 만드는 크기까지 같이 재게 된다.
    await mutateDb(() => null);
    const before = (await readDoc())!.text.length;

    const oneMb = pptxBytes(1024 * 1024);
    const template = await savePptTemplate({
      kind: "event",
      name: "행사 운영안 양식",
      file_buffer: oneMb,
      placeholders: ["{{브랜드명}}"],
    });

    const after = (await readDoc())?.text.length ?? 0;

    // 문서에는 키만 들어간다. 파일 크기의 근처에도 가지 않아야 한다.
    expect(after - before).toBeLessThan(2000);
    expect(template.file_key).toBe(`${template.id}.pptx`);
    expect(template.file_data).toBeUndefined();

    // 문서 어디에도 파일 내용이 없어야 한다.
    const doc = (await readDoc())!.text;
    expect(doc.includes(oneMb.toString("base64").slice(0, 64))).toBe(false);
  });

  it("저장한 파일을 그대로 다시 읽는다", async () => {
    const bytes = pptxBytes(4096);
    const template = await savePptTemplate({
      kind: "sns",
      name: "SNS 제안서 양식",
      file_buffer: bytes,
      placeholders: [],
    });

    const back = await getPptTemplateBuffer(template);
    expect(back).not.toBeNull();
    expect(back!.length).toBe(bytes.length);
    expect(back!.equals(bytes)).toBe(true);
  });

  it("pptx 가 아니거나 15MB 를 넘으면 거부한다", async () => {
    await expect(
      savePptTemplate({ kind: "event", name: "가짜", file_buffer: Buffer.from("not a zip"), placeholders: [] })
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      savePptTemplate({ kind: "event", name: "큰 파일", file_buffer: pptxBytes(16 * 1024 * 1024), placeholders: [] })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("템플릿을 지우면 파일도 지운다", async () => {
    const template = await savePptTemplate({
      kind: "report",
      name: "보고서 양식",
      file_buffer: pptxBytes(2048),
      placeholders: [],
    });
    expect(await statFile(template.file_key!, "templates")).not.toBeNull();

    expect(await deletePptTemplate(template.id)).toBe(true);

    expect(await getPptTemplateById(template.id)).toBeNull();
    expect(await statFile(template.file_key!, "templates")).toBeNull();
  });

  it("내장 템플릿도 지울 수 있다. 다만 되살릴 수 있게 기억해둔다", async () => {
    const builtin = (await getPptTemplates()).find((t) => t.builtin);
    expect(builtin).toBeDefined();
    expect(await deletePptTemplate(builtin!.id)).toBe(true);
    expect(await getHiddenBuiltinTemplateCount()).toBe(1);
  });

  it("예전에 base64 로 저장된 템플릿도 계속 읽힌다", async () => {
    const legacyBytes = pptxBytes(1024);
    const legacyId = "11111111-2222-4333-8444-555555555555";
    await mutateDb((db) => {
      db.ppt_templates.push({
        id: legacyId,
        kind: "event",
        name: "옛날 양식",
        file_data: legacyBytes.toString("base64"),
        placeholders: [],
        uploaded_at: new Date().toISOString(),
      });
      return null;
    });

    const legacy = await getPptTemplateById(legacyId);
    const back = await getPptTemplateBuffer(legacy!);
    expect(back!.equals(legacyBytes)).toBe(true);
  });
});

describe("PPT 템플릿 클라이언트 직접 업로드", () => {
  it("저장 경로를 만들고, 올라온 파일을 확인해 등록한다", async () => {
    const prep = await preparePptTemplateUpload("event", "행사 양식");
    expect(prep.pathname).toBe(buildTemplatePathname(prep.templateId));

    const bytes = pptxBytes(8192);
    await putFile(prep.fileKey, bytes, "application/octet-stream", "templates");

    // 치환 항목을 뽑으려면 등록 전에 파일을 읽을 수 있어야 한다.
    const preread = await readUploadedPptTemplateBuffer(prep.templateId);
    expect(preread!.equals(bytes)).toBe(true);

    const template = await recordUploadedPptTemplate({
      templateId: prep.templateId,
      kind: "event",
      name: "행사 양식",
      placeholders: ["{{브랜드명}}"],
    });
    expect(template.file_key).toBe(prep.fileKey);

    const back = await getPptTemplateBuffer(template);
    expect(back!.equals(bytes)).toBe(true);
  });

  it("pptx 가 아니면 거부하고 올라온 파일을 지운다", async () => {
    const prep = await preparePptTemplateUpload("sns", "위장 양식");
    await putFile(prep.fileKey, Buffer.from("이건 zip 이 아닙니다"), "application/octet-stream", "templates");

    await expect(
      recordUploadedPptTemplate({ templateId: prep.templateId, kind: "sns", name: "위장 양식", placeholders: [] })
    ).rejects.toBeInstanceOf(ValidationError);

    expect(await statFile(prep.fileKey, "templates")).toBeNull();
  });

  it("올라온 파일이 없으면 거부한다", async () => {
    const prep = await preparePptTemplateUpload("report", "없는 양식");
    await expect(
      recordUploadedPptTemplate({ templateId: prep.templateId, kind: "report", name: "없는 양식", placeholders: [] })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("템플릿 이름과 종류 수정", () => {
  it("파일을 건드리지 않고 이름과 종류만 바꾼다", async () => {
    const bytes = pptxBytes(2048);
    const t = await savePptTemplate({ kind: "event", name: "옛 이름", file_buffer: bytes, placeholders: ["{{브랜드명}}"] });

    const updated = await updatePptTemplateMeta(t.id, { name: "새 이름", kind: "report" });
    expect(updated!.name).toBe("새 이름");
    expect(updated!.kind).toBe("report");
    // 같은 파일을 계속 가리켜야, 이 템플릿을 쓰던 운영안이 끊기지 않는다.
    expect(updated!.file_key).toBe(t.file_key);
    expect((await getPptTemplateBuffer(updated!))!.equals(bytes)).toBe(true);
  });

  it("빈 이름은 거부한다", async () => {
    const t = await savePptTemplate({ kind: "event", name: "이름", file_buffer: pptxBytes(1024), placeholders: [] });
    await expect(updatePptTemplateMeta(t.id, { name: "   " })).rejects.toBeInstanceOf(ValidationError);
  });

  it("기본 내장 템플릿은 이름을 바꿀 수 없다", async () => {
    const builtin = (await getPptTemplates()).find((t) => t.builtin)!;
    await expect(updatePptTemplateMeta(builtin.id, { name: "바꾼 이름" })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("템플릿 파일 교체", () => {
  it("id 를 유지한 채 내용만 갈아끼운다", async () => {
    const before = pptxBytes(1024, "old-body");
    const t = await savePptTemplate({ kind: "event", name: "운영안", file_buffer: before, placeholders: ["{{예전}}"] });
    const oldKey = t.file_key!;

    const prep = await preparePptTemplateReplace(t.id);
    // 쓰고 있는 키를 덮어쓰지 않는다. 교체가 실패해도 기존 파일이 살아 있어야 한다.
    expect(prep.fileKey).not.toBe(oldKey);

    const after = pptxBytes(4096, "new-body");
    await putFile(prep.fileKey, after, "application/octet-stream", "templates");

    const updated = await recordReplacedPptTemplate({ templateId: t.id, fileKey: prep.fileKey, placeholders: ["{{새것}}"] });

    expect(updated.id).toBe(t.id);
    expect(updated.placeholders).toEqual(["{{새것}}"]);
    expect((await getPptTemplateBuffer(updated))!.equals(after)).toBe(true);
    // 옛 파일은 기록이 새 파일을 가리킨 뒤에 치운다.
    expect(await statFile(oldKey, "templates")).toBeNull();
  });

  it("올라온 파일이 pptx 가 아니면 거부하고 기존 파일을 지키다", async () => {
    const original = pptxBytes(1024, "keep-me");
    const t = await savePptTemplate({ kind: "sns", name: "제안서", file_buffer: original, placeholders: [] });

    const prep = await preparePptTemplateReplace(t.id);
    await putFile(prep.fileKey, Buffer.from("zip 이 아님"), "application/octet-stream", "templates");

    await expect(
      recordReplacedPptTemplate({ templateId: t.id, fileKey: prep.fileKey, placeholders: [] })
    ).rejects.toBeInstanceOf(ValidationError);

    // 쓰던 파일은 그대로 남아야 한다.
    const still = await getPptTemplateById(t.id);
    expect((await getPptTemplateBuffer(still!))!.equals(original)).toBe(true);
    expect(await statFile(prep.fileKey, "templates")).toBeNull();
  });

  it("다른 템플릿의 키로는 교체할 수 없다", async () => {
    const a = await savePptTemplate({ kind: "event", name: "A", file_buffer: pptxBytes(1024), placeholders: [] });
    const b = await savePptTemplate({ kind: "event", name: "B", file_buffer: pptxBytes(1024), placeholders: [] });
    await expect(
      recordReplacedPptTemplate({ templateId: a.id, fileKey: b.file_key!, placeholders: [] })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("기본 내장 템플릿은 파일을 바꿀 수 없다", async () => {
    const builtin = (await getPptTemplates()).find((t) => t.builtin)!;
    await expect(preparePptTemplateReplace(builtin.id)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("기본 내장 템플릿 삭제와 되살리기", () => {
  it("지우면 다시 읽어도 되살아나지 않는다", async () => {
    const builtin = (await getPptTemplates()).find((t) => t.builtin)!;
    const before = (await getPptTemplates()).length;

    expect(await deletePptTemplate(builtin.id)).toBe(true);

    // 내장 템플릿은 코드에서 매번 채워 넣기 때문에, 기억하지 않으면 다음 읽기에 살아난다.
    const after = await getPptTemplates();
    expect(after.length).toBe(before - 1);
    expect(after.some((t) => t.id === builtin.id)).toBe(false);
    expect(await getPptTemplateById(builtin.id)).toBeNull();
    expect(await getHiddenBuiltinTemplateCount()).toBe(1);
  });

  it("되살리면 다시 목록에 나온다", async () => {
    const builtin = (await getPptTemplates()).find((t) => t.builtin)!;
    await deletePptTemplate(builtin.id);

    expect(await restoreBuiltinPptTemplates()).toBe(1);
    expect(await getHiddenBuiltinTemplateCount()).toBe(0);

    const back = await getPptTemplateById(builtin.id);
    expect(back).not.toBeNull();
    expect(back!.builtin).toBe(true);
    // 내장 템플릿은 코드에서 만들어 쓰므로 파일 없이도 내용이 나와야 한다.
    expect((await getPptTemplateBuffer(back!))!.length).toBeGreaterThan(0);
  });

  it("내장 템플릿을 전부 지워도 되살릴 수 있다", async () => {
    for (const t of (await getPptTemplates()).filter((x) => x.builtin)) {
      await deletePptTemplate(t.id);
    }
    expect((await getPptTemplates()).filter((t) => t.builtin)).toHaveLength(0);

    await restoreBuiltinPptTemplates();
    expect((await getPptTemplates()).filter((t) => t.builtin).length).toBeGreaterThan(0);
  });
});
