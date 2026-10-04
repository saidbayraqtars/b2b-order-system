"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { CompanyRow } from "@repo/services";
import { apiGet } from "@/lib/fetcher";
import {
  Badge,
  LoadingState,
  TBody,
  THead,
  Table,
  TableEmpty,
  Td,
  Th,
} from "@/components/ui";
import { formatTRY } from "@/lib/format";
import { ErrorLine, Select, TextInput } from "@/components/form";
import { useUrlState } from "@/lib/url-state";
import {
  CODE_FILTER_DEFAULTS,
  CustomCodeFilters,
  CustomCodeSummary,
  appendCodeFilters,
} from "@/components/custom-codes";

export function CompaniesList() {
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  // Özel kod süzgeci adreste: "Ege bölgesindeki bayiler" paylaşılabilir bir
  // bağlantı olsun.
  const codeFilters = useUrlState(CODE_FILTER_DEFAULTS);

  const qs = new URLSearchParams();
  if (search) qs.set("search", search);
  if (includeInactive) qs.set("includeInactive", "1");
  appendCodeFilters(qs, codeFilters.value);
  const queryString = qs.toString();

  const query = useQuery({
    queryKey: ["admin-companies", queryString],
    queryFn: () =>
      apiGet<{ companies: CompanyRow[] }>(`/api/admin/companies?${queryString}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <TextInput
          value={search}
          placeholder="Firma adı veya vergi no"
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-72"
        />
        <Select
          value={includeInactive ? "1" : "0"}
          onChange={(e) => setIncludeInactive(e.target.value === "1")}
          className="max-w-44"
        >
          <option value="0">Yalnız aktifler</option>
          <option value="1">Pasifler dahil</option>
        </Select>
        <CustomCodeFilters
          entity="COMPANY"
          value={codeFilters.value}
          onChange={(key, next) => codeFilters.set({ [key]: next })}
        />
      </div>

      {query.isLoading && <LoadingState />}
      <ErrorLine error={query.error} />

      {query.data && (
        <div className="overflow-hidden rounded-lg border border-line bg-panel">
          <Table>
            <THead>
              <tr>
                <Th>Firma</Th>
                <Th>Grup</Th>
                <Th>Plasiyer</Th>
                <Th align="right">Bakiye</Th>
                <Th align="right">Limit</Th>
                <Th align="right">Kullanılabilir</Th>
                <Th align="right">Vade</Th>
                <Th align="right">Ekstre</Th>
              </tr>
            </THead>
            <TBody>
              {query.data.companies.map((c) => (
                <tr key={c.id} className={c.isActive ? "" : "opacity-60"}>
                  <Td className="font-medium">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/companies/${c.id}`}
                        className="hover:underline"
                      >
                        {c.name}
                      </Link>
                      {!c.isActive && <Badge>Pasif</Badge>}
                    </span>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {c.counts.orders} sipariş · {c.counts.users} kullanıcı ·{" "}
                      {c.counts.addresses} adres
                    </p>
                    <CustomCodeSummary entity="COMPANY" codes={c.codes} />
                  </Td>
                  <Td muted>{c.customerGroup?.name ?? "—"}</Td>
                  <Td muted>{c.salesRep?.name ?? "—"}</Td>
                  <Td align="right" numeric>
                    {formatTRY(c.currentBalance)}
                  </Td>
                  <Td align="right" numeric>
                    {formatTRY(c.creditLimit)}
                  </Td>
                  <Td
                    align="right"
                    numeric
                    className={
                      Number(c.availableCredit) < 0
                        ? "text-critical"
                        : "text-positive"
                    }
                  >
                    {formatTRY(c.availableCredit)}
                  </Td>
                  <Td align="right" numeric muted>
                    {c.paymentTermDays} gün
                  </Td>
                  <Td align="right">
                    <Link
                      href={`/admin/companies/${c.id}/statement`}
                      className="font-medium text-ink-muted transition-colors hover:text-ink"
                    >
                      Ekstre
                    </Link>
                  </Td>
                </tr>
              ))}
              {query.data.companies.length === 0 && (
                <TableEmpty colSpan={8} label="Firma bulunamadı." />
              )}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
