"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import {
  EmptyState,
  LoadingState,
  TBody,
  THead,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { ErrorLine } from "@/components/form";

interface CompanyRow {
  id: string;
  name: string;
  creditLimit: string;
  currentBalance: string;
  isActive: boolean;
}

/**
 * Panonun cari özeti. Çerçevesizdir — panoda bir `Panel`in gövdesine oturuyor
 * ve kendi kenar çizgisini de çizseydi iki çizgi üst üste binerdi.
 */
export function CompaniesTable() {
  const query = useQuery({
    queryKey: ["companies"],
    queryFn: () => apiGet<{ companies: CompanyRow[] }>("/api/admin/companies"),
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorLine error={query.error} />;

  const companies = query.data?.companies ?? [];
  if (companies.length === 0) return <EmptyState label="Firma yok." />;

  return (
    <Table>
      <THead>
        <tr>
          <Th>Firma</Th>
          <Th align="right">Bakiye</Th>
          <Th align="right">Limit</Th>
          <Th align="right">Kullanılabilir</Th>
          <Th align="right">Ekstre</Th>
        </tr>
      </THead>
      <TBody>
        {companies.map((c) => {
          const available = Number(c.creditLimit) - Number(c.currentBalance);
          return (
            <tr key={c.id}>
              <Td className="font-medium">
                <Link
                  href={`/admin/companies/${c.id}`}
                  className="hover:underline"
                  title="Firmaya özel iskontolar"
                >
                  {c.name}
                </Link>
              </Td>
              <Td align="right" numeric>
                {formatTRY(c.currentBalance)}
              </Td>
              <Td align="right" numeric>
                {formatTRY(c.creditLimit)}
              </Td>
              <Td
                align="right"
                numeric
                className={available < 0 ? "text-critical" : "text-positive"}
              >
                {formatTRY(available)}
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
          );
        })}
      </TBody>
    </Table>
  );
}
