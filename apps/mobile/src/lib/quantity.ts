// Adet kuralları.
//
// Bunlar **rehber**, kapı değil: asıl kontrol siparişte ve fiyat teklifinde
// sunucuda yapılıyor (MOQ, koli katı, stok). Buradaki hesap yalnızca artı/eksi
// düğmesinin bir sonraki geçerli adede atlaması için — kullanıcıyı elle 24'ten
// 36'ya çıkarmaya uğraştırmamak, sonra da 422 ile geri çevirmemek için.
//
// Sepet sunucuya taşındığında bu kural cihazda kaldı, çünkü sunucudaki sepet
// bilerek doğrulama yapmıyor: düzenlenmekte olan bir adet yüzünden azarlanmak
// can sıkıcı olurdu.

export interface QuantityLimits {
  unitsPerCase: number;
  moqUnits: number;
  stock: number;
}

/** Clamp qty to [moq, stock] and snap up to a whole number of cases. */
export function normalizeQty(limits: QuantityLimits, qty: number): number {
  const step = Math.max(1, limits.unitsPerCase);
  let q = Math.max(limits.moqUnits, qty);
  q = Math.ceil(q / step) * step; // snap to case multiple
  if (q > limits.stock) {
    q = Math.floor(limits.stock / step) * step; // largest case multiple in stock
  }
  return Math.max(0, q);
}

/** İlk eklemede kaç adet: koli ile minimum siparişin büyüğü. */
export function initialQty(limits: QuantityLimits): number {
  return normalizeQty(limits, Math.max(limits.moqUnits, limits.unitsPerCase));
}
