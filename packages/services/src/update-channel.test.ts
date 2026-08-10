import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  readUpdateState,
  updateStateFile,
  updateStatus,
  STALE_AFTER_MS,
  type UpdateState,
} from "./update-channel";

// Bu dosyanın konusu tek bir soru: ekranda yazan şey doğru mu?
//
// Sürüm ekranı ajanın bıraktığı bir dosyayı okuyor ve o dosya yanlış, eski ya
// da yarım olabilir. Yanlış cevabın bedeli gerçek: "Güncel" yazan bir kurulum
// aslında üç sürüm geride olabilir ve kimse bakmaz.

let dir: string;
const previous = process.env.UPDATE_STATE_FILE;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "b2b-update-"));
});

afterEach(() => {
  delete process.env.UPDATE_STATE_FILE;
});

afterAll(() => {
  if (previous === undefined) delete process.env.UPDATE_STATE_FILE;
  else process.env.UPDATE_STATE_FILE = previous;
});

const NOW = new Date("2026-08-10T12:00:00.000Z");

function state(over: Partial<UpdateState> = {}): UpdateState {
  return {
    schema: 1,
    checkedAt: NOW.toISOString(),
    channel: "stable",
    policy: "notify",
    currentVersion: "v1.3.0",
    available: null,
    lastRun: null,
    error: null,
    ...over,
  };
}

async function writeState(name: string, body: unknown): Promise<string> {
  const file = path.join(dir, name);
  await writeFile(file, typeof body === "string" ? body : JSON.stringify(body), "utf8");
  process.env.UPDATE_STATE_FILE = file;
  return file;
}

describe("updateStateFile", () => {
  it("yol verilmemişse özellik kapalı sayılır", () => {
    expect(updateStateFile()).toBeNull();
  });
});

describe("updateStatus", () => {
  it("ajan tanımlı değilse 'disabled', tanımlıysa 'unknown'", () => {
    expect(updateStatus(null, NOW)).toBe("disabled");
    process.env.UPDATE_STATE_FILE = path.join(dir, "yok.json");
    expect(updateStatus(null, NOW)).toBe("unknown");
  });

  it("yayımlanan sürüm çalışanla aynıysa güncel", () => {
    expect(updateStatus(state({ available: release("v1.3.0") }), NOW)).toBe("current");
  });

  it("yayımlanan sürüm farklıysa güncelleme var", () => {
    expect(updateStatus(state({ available: release("v1.4.0") }), NOW)).toBe("available");
  });

  it("ajan uzun süredir bakmadıysa 'güncel' demez", () => {
    // En önemli durum. Dosya son baktığı anı anlatmaya devam eder; ölmüş bir
    // ajanın "güncelsiniz" cevabı, aylarca yamasız kalan kurulum demektir.
    const old = new Date(NOW.getTime() - STALE_AFTER_MS - 1000).toISOString();
    expect(updateStatus(state({ checkedAt: old, available: release("v1.3.0") }), NOW)).toBe("stale");
  });

  it("eşiğin bir saat berisinde hâlâ taze", () => {
    const recent = new Date(NOW.getTime() - STALE_AFTER_MS + 3_600_000).toISOString();
    expect(updateStatus(state({ checkedAt: recent, available: release("v1.3.0") }), NOW)).toBe(
      "current",
    );
  });

  it("akış okunamadıysa hata", () => {
    expect(updateStatus(state({ error: "Sürüm akışı okunamadı" }), NOW)).toBe("error");
  });

  it("düşen güncelleme, bekleyen güncellemenin önüne geçer", () => {
    // İkisi birlikte olur: güncelleme düştüğünde aynı sürüm hâlâ "hazır"
    // görünür. Operatörün önce görmesi gereken şey, tekrar denemeden önce
    // neyin düştüğü.
    const s = state({
      available: release("v1.4.0"),
      lastRun: {
        startedAt: NOW.toISOString(),
        finishedAt: NOW.toISOString(),
        fromVersion: "v1.3.0",
        toVersion: "v1.4.0",
        result: "failed",
        message: "update.sh düştü",
      },
    });
    expect(updateStatus(s, NOW)).toBe("failed");
  });

  it("başarılı geçmiş bir güncelleme durumu bozmaz", () => {
    const s = state({
      currentVersion: "v1.4.0",
      available: release("v1.4.0"),
      lastRun: {
        startedAt: NOW.toISOString(),
        finishedAt: NOW.toISOString(),
        fromVersion: "v1.3.0",
        toVersion: "v1.4.0",
        result: "success",
        message: "Güncellendi",
      },
    });
    expect(updateStatus(s, NOW)).toBe("current");
  });
});

describe("readUpdateState", () => {
  it("yol tanımlı değilse null", async () => {
    expect(await readUpdateState()).toBeNull();
  });

  it("dosya yoksa null — atmaz", async () => {
    process.env.UPDATE_STATE_FILE = path.join(dir, "hic-yok.json");
    expect(await readUpdateState()).toBeNull();
  });

  it("yarım yazılmış dosya null döner, patlamaz", async () => {
    // Ajan geçici dosyaya yazıp taşıyor, ama disk dolabilir ya da eski bir
    // sürümün formatı kalabilir. Sürüm ekranının kendisi bir dosya bozuk diye
    // 500 vermemeli.
    await writeState("yarim.json", '{ "schema": 1, "checkedAt": ');
    expect(await readUpdateState()).toBeNull();
  });

  it("şeması tutmayan dosya null döner", async () => {
    await writeState("eski.json", { schema: 99, checkedAt: NOW.toISOString() });
    expect(await readUpdateState()).toBeNull();
  });

  it("geçerli dosya okunur ve eksik alanlar varsayılana düşer", async () => {
    await writeState("iyi.json", {
      schema: 1,
      checkedAt: NOW.toISOString(),
      channel: "stable",
      policy: "auto",
      currentVersion: "v1.3.0",
      available: { version: "v1.4.0" },
    });
    const s = await readUpdateState();
    expect(s?.policy).toBe("auto");
    expect(s?.available?.version).toBe("v1.4.0");
    expect(s?.available?.mandatory).toBe(false);
    expect(s?.available?.releasedAt).toBeNull();
    expect(s?.lastRun).toBeNull();
    expect(updateStatus(s, NOW)).toBe("available");
  });

  it("tanınmayan politika reddedilir", async () => {
    // Politika ekranda cümleye çevriliyor; serbest metin kabul edilseydi ekran
    // "yakında" gibi bir şey yazan bir kurulumda ne yaptığını söylemezdi.
    await writeState("politika.json", { ...state(), policy: "belki" });
    expect(await readUpdateState()).toBeNull();
  });
});

function release(version: string) {
  return { version, releasedAt: null, notes: "", mandatory: false };
}
