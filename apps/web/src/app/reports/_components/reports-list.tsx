"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { REPORT_DATASET_LABELS } from "@repo/types";
import { apiGet } from "@/lib/fetcher";
import { ErrorLine } from "@/components/form";
import {
  Badge,
  LoadingState,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import type { DefinitionSummary } from "./types";

export function ReportsList() {
  const query = useQuery({
    queryKey: ["report-definitions"],
    queryFn: () =>
      apiGet<{ definitions: DefinitionSummary[] }>("/api/reports/definitions"),
  });

  if (query.isLoading) {
    return <LoadingState />;
  }
  if (query.isError) {
    return <ErrorLine error={query.error} />;
  }

  const definitions = query.data!.definitions;

  return (
    <Table>
      <THead>
        <tr>
          <Th>Rapor</Th>
          <Th>Veri kümesi</Th>
          <Th>Sahibi</Th>
          <Th>Güncelleme</Th>
        </tr>
      </THead>
      <TBody>
        {definitions.map((d) => (
          <tr key={d.id}>
            <Td>
              <Link href={`/reports/${d.id}`} className="font-medium underline">
                {d.name}
              </Link>
              {d.description && (
                <p className="mt-0.5 text-xs text-ink-faint">
                  {d.description}
                </p>
              )}
            </Td>
            <Td muted>{REPORT_DATASET_LABELS[d.dataset]}</Td>
            <Td>
              <span className="flex items-center gap-2 text-ink-muted">
                {d.isOwn ? "Siz" : d.ownerName}
                {d.isShared && <Badge tone="success">paylaşık</Badge>}
              </span>
            </Td>
            <Td muted>{new Date(d.updatedAt).toLocaleDateString("tr-TR")}</Td>
          </tr>
        ))}
        {definitions.length === 0 && (
          <TableEmpty
            colSpan={4}
            label="Henüz kayıtlı rapor yok — “Yeni rapor” ile başlayın."
          />
        )}
      </TBody>
    </Table>
  );
}
