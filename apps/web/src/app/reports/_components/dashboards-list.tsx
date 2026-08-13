"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DashboardSummary } from "@repo/services";
import { apiGet, apiPost } from "@/lib/fetcher";
import { Button, ErrorLine, TextInput } from "@/components/form";
import {
  Badge,
  LoadingState,
  PageHeader,
  Table,
  TBody,
  TableEmpty,
  Td,
  Th,
  THead,
} from "@/components/ui";
import { useState } from "react";

/**
 * The list of boards. Creating one takes a name and nothing else — an empty
 * board opens straight into its own editor, which is where tiles are chosen.
 * Asking for tiles up front would mean building the board twice.
 */
export function DashboardsList() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const query = useQuery({
    queryKey: ["report-dashboards"],
    queryFn: () =>
      apiGet<{ dashboards: DashboardSummary[] }>("/api/reports/dashboards"),
  });

  const create = useMutation({
    mutationFn: () =>
      apiPost<{ id: string }>("/api/reports/dashboards", {
        name: name.trim(),
        tiles: [],
      }),
    onSuccess: (created) => {
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["report-dashboards"] });
      router.push(`/reports/dashboards/${created.id}`);
    },
  });

  return (
    <>
      <PageHeader
        title="Panolar"
        subtitle="Birden çok raporu tek ekranda toplayın"
        actions={
          <div className="flex items-end gap-2">
            <TextInput
              value={name}
              placeholder="Yeni pano adı"
              aria-label="Yeni pano adı"
              className="w-48"
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              disabled={!name.trim()}
              loading={create.isPending}
              onClick={() => create.mutate()}
            >
              Oluştur
            </Button>
          </div>
        }
      />

      <ErrorLine error={create.error} />

      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorLine error={query.error} />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Pano</Th>
              <Th align="right">Rapor</Th>
              <Th>Sahibi</Th>
              <Th>Güncelleme</Th>
            </tr>
          </THead>
          <TBody>
            {query.data!.dashboards.map((d) => (
              <tr key={d.id}>
                <Td>
                  <Link
                    href={`/reports/dashboards/${d.id}`}
                    className="font-medium underline"
                  >
                    {d.name}
                  </Link>
                  {d.description && (
                    <p className="text-xs text-neutral-500">{d.description}</p>
                  )}
                </Td>
                <Td align="right" numeric>
                  {d.tileCount}
                </Td>
                <Td>
                  <span className="flex items-center gap-2">
                    {d.isOwn ? "Siz" : d.ownerName}
                    {d.isShared && <Badge tone="success">paylaşık</Badge>}
                  </span>
                </Td>
                <Td>{new Date(d.updatedAt).toLocaleDateString("tr-TR")}</Td>
              </tr>
            ))}
            {query.data!.dashboards.length === 0 && (
              <TableEmpty colSpan={4} label="Henüz pano yok." />
            )}
          </TBody>
        </Table>
      )}
    </>
  );
}
