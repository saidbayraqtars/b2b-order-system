import { prisma } from "@repo/database";
import type { SaveHolidayInput } from "@repo/types";
import { dayKeyUtc } from "./analytics-math";

// Resmî tatil takvimi (KALAN-ISLER §6.4).
//
// Üç karar burada görünüyor:
//
//  1. **Tarihler tabloda, kodda değil.** 1 Ocak ve 29 Ekim sabit ama ramazan
//     ve kurban bayramı ay takvimiyle kayıyor, arife ilanları her yıl ayrı
//     çıkıyor. Kodda gömülü bir liste ikinci yılda bayatlar ve kimse fark
//     etmez — yanlış tahmin sessizce döner.
//  2. **Yıl bazlı önerilen liste var, otomatik yazma yok.** `suggestFixed`
//     yalnızca *sabit tarihli* millî günleri öneriyor; ekran onları
//     gösteriyor, kaydeden kullanıcı. Dinî bayramlar önerilmiyor: tarihini
//     uydurmak, boş takvimden kötü.
//  3. **Gün UTC'ye çapalı, yerel saate değil.** Kolon `DATE`; sürücü onu UTC
//     gece yarısı olarak yazıp okuyor. Yerel gece yarısı yazılsaydı UTC+3'te
//     kayıt bir önceki güne düşerdi — ilk denemede tam bunu yaptı: 1 Ocak
//     diskte 31 Aralık oldu. Gün bir takvim gerçeği, sunucunun saat dilimi
//     onu kaydıramaz.

/** "YYYY-AA-GG" → UTC gece yarısı. Dize doğrudan ayrıştırılıyor: `new Date(s)`
 *  saat dilimine göre komşu güne kayabiliyor. */
function dayToUtc(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

/** Yerel bir tarihin **takvim gününü** UTC gece yarısına çeviriyor. */
function localDayToUtc(date: Date): Date {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
}

export interface HolidayRow {
  id: string;
  date: string;
  name: string;
  halfDay: boolean;
}

function toRow(r: {
  id: string;
  date: Date;
  name: string;
  halfDay: boolean;
}): HolidayRow {
  return {
    id: r.id,
    date: dayKeyUtc(r.date),
    name: r.name,
    halfDay: r.halfDay,
  };
}

/** Bir yılın tatilleri; ekran yıl yıl geziyor. */
export async function listHolidays(year: number): Promise<HolidayRow[]> {
  const rows = await prisma.holiday.findMany({
    where: {
      date: {
        gte: new Date(Date.UTC(year, 0, 1)),
        lte: new Date(Date.UTC(year, 11, 31)),
      },
    },
    orderBy: { date: "asc" },
  });
  return rows.map(toRow);
}

/**
 * Aynı güne ikinci kayıt gelirse **üzerine yazıyor**, hata vermiyor: operatör
 * "1 Ocak"ı iki kez girdiğinde istediği şey ikinci kayıt, bir hata mesajı
 * değil.
 */
export async function saveHoliday(
  input: SaveHolidayInput,
  userId: string,
): Promise<HolidayRow> {
  const date = dayToUtc(input.date);
  const row = await prisma.holiday.upsert({
    where: { date },
    update: { name: input.name, halfDay: input.halfDay },
    create: {
      date,
      name: input.name,
      halfDay: input.halfDay,
      createdById: userId,
    },
  });
  return toRow(row);
}

/** Yerel bir tarih aralığını `DATE` kolonuna soracak hâle getiriyor. */
export function toUtcDay(date: Date): Date {
  return localDayToUtc(date);
}

export async function deleteHoliday(id: string): Promise<void> {
  await prisma.holiday.delete({ where: { id } });
}

/**
 * Sabit tarihli millî günler. **Öneri**, kayıt değil.
 *
 * Dinî bayramlar burada yok ve olmayacak: ay takvimine bağlılar, ve
 * uydurulmuş bir tarih girilmemiş bir tarihten kötüdür — biri sorgulanır,
 * diğeri sorgulanmaz.
 */
export function suggestFixed(year: number): Array<{ date: string; name: string }> {
  const days: Array<[number, number, string]> = [
    [1, 1, "Yılbaşı"],
    [4, 23, "Ulusal Egemenlik ve Çocuk Bayramı"],
    [5, 1, "Emek ve Dayanışma Günü"],
    [5, 19, "Atatürk'ü Anma, Gençlik ve Spor Bayramı"],
    [7, 15, "Demokrasi ve Millî Birlik Günü"],
    [8, 30, "Zafer Bayramı"],
    [10, 29, "Cumhuriyet Bayramı"],
  ];
  return days.map(([m, d, name]) => ({
    date: dayKeyUtc(new Date(Date.UTC(year, m - 1, d))),
    name,
  }));
}
