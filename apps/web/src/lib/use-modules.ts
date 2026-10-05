"use client";

import { useQuery } from "@tanstack/react-query";
import { MODULES, type ModuleKey } from "@repo/types";
import { apiGet } from "@/lib/fetcher";

/**
 * Kapalı modüller, istemci tarafı gezinme için.
 *
 * Yalnızca **görüntü**: kapı sunucuda (`requirePage(..., { module })`). Liste
 * yüklenene kadar her şey açık sayılıyor — kısa bir an fazla bir satır görmek,
 * menünün titremesinden iyidir; tıklanan satır zaten sunucuda kapanıyor.
 */
export function useDisabledModules(): readonly ModuleKey[] {
  const query = useQuery({
    queryKey: ["modules", "disabled"],
    queryFn: () => apiGet<{ disabled: ModuleKey[] }>("/api/modules"),
    staleTime: 60_000,
  });
  return query.data?.disabled ?? [];
}

/**
 * Tek modül açık mı. Liste yüklenene kadar modülün **kendi varsayılanı**
 * geçerli: kapalı başlayan `depo` modülünün alanları yüklenirken bir an
 * görünüp kaybolmamalı.
 */
export function useModuleEnabled(key: ModuleKey): boolean {
  const query = useQuery({
    queryKey: ["modules", "disabled"],
    queryFn: () => apiGet<{ disabled: ModuleKey[] }>("/api/modules"),
    staleTime: 60_000,
  });
  if (!query.data) return MODULES[key].defaultEnabled ?? true;
  return !query.data.disabled.includes(key);
}
