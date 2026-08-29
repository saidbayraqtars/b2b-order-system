import { describe, expect, it } from "vitest";
import { normalizeConfig } from "./report-engine";
import {
  findReportTemplate,
  REPORT_TEMPLATES,
  REPORT_TEMPLATE_CATEGORIES,
} from "./report-templates";

// Hazır şablonlar.
//
// Bu dosyanın tek işi **şablonun kurulur olduğunu** kanıtlamak. Şablon kodda
// yazılı olduğu için doğru sanılıyor; oysa alan adları kayıt defterinden
// geliyor ve bir alanın adı değiştiğinde şablon sessizce bozuluyor —
// kullanıcı "Kur" düğmesine bastığında, yani en kötü anda. `normalizeConfig`
// kurulumda da çalışan doğrulayıcının kendisi.

describe("hazır rapor şablonları", () => {
  it("her şablon kayıt defterinden geçiyor", () => {
    for (const t of REPORT_TEMPLATES) {
      expect(
        () => normalizeConfig(t.dataset, t.config),
        `${t.key} (${t.name})`,
      ).not.toThrow();
    }
  });

  it("anahtarlar benzersiz", () => {
    const keys = REPORT_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("her şablonun kategorisi listede", () => {
    for (const t of REPORT_TEMPLATES) {
      expect(REPORT_TEMPLATE_CATEGORIES).toContain(t.category);
    }
  });

  it("her kategoride en az bir şablon var", () => {
    // Boş bir kategori sekmesi, ekranın kırık olduğunu düşündürüyor.
    for (const category of REPORT_TEMPLATE_CATEGORIES) {
      expect(
        REPORT_TEMPLATES.some((t) => t.category === category),
        category,
      ).toBe(true);
    }
  });

  it("bilinmeyen anahtar null", () => {
    expect(findReportTemplate("yok-boyle-bir-sey")).toBeNull();
  });

  it("kayan pencere kullanan şablonlar tarih dondurmuyor", () => {
    // Kaydedilmiş bir rapor sabit tarihle bayatlar: "son 90 gün" diyen şablon
    // `lastNDays` kullanmak zorunda, `between` değil.
    const rolling = REPORT_TEMPLATES.filter((t) =>
      t.config.filters.some((f) => f.operator === "lastNDays"),
    );
    expect(rolling.length).toBeGreaterThan(0);
    for (const t of rolling) {
      expect(
        t.config.filters.every((f) => f.operator !== "between"),
        t.key,
      ).toBe(true);
    }
  });
});
