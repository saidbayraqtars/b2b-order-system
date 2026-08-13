"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DashboardRunResult, DashboardTileResult } from "@repo/services";
import { TILE_WIDTH_LABELS, type DashboardTile, type TileWidth } from "@repo/types";
import { apiDelete, apiGet, apiPatch } from "@/lib/fetcher";
import { ReportPreview } from "@/components/report-preview";
import {
  Button,
  Checkbox,
  ErrorLine,
  LinkButton,
  Panel,
  Select,
  TextInput,
} from "@/components/form";
import { LoadingState, PageHeader } from "@/components/ui";
import type { DefinitionSummary } from "./types";

/**
 * A board: several saved reports drawn on one screen.
 *
 * Everything comes from one request. The run endpoint carries the board's own
 * name and whether this user may edit it, so opening a board does not ask the
 * detail endpoint anything — a user who may read reports but not build them
 * would not be allowed to answer that question anyway.
 */
export function DashboardView({ id }: { id: string }) {
  const [editing, setEditing] = useState(false);

  const run = useQuery({
    queryKey: ["report-dashboard-run", id],
    queryFn: () =>
      apiGet<DashboardRunResult>(`/api/reports/dashboards/${id}/run`),
  });

  if (run.isLoading) return <LoadingState />;
  if (run.isError) return <ErrorLine error={run.error} />;

  const board = run.data!;

  return (
    <>
      <PageHeader
        title={board.name}
        subtitle={board.description ?? `${board.tiles.length} rapor`}
        back={{ href: "/reports/dashboards", label: "Panolar" }}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => void run.refetch()}
              loading={run.isFetching}
            >
              Yenile
            </Button>
            {board.canEdit && (
              <Button
                variant="secondary"
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? "Düzenlemeyi kapat" : "Düzenle"}
              </Button>
            )}
          </div>
        }
      />

      {editing && board.canEdit && (
        <DashboardEditor board={board} onDone={() => setEditing(false)} />
      )}

      {board.tiles.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Bu panoda henüz rapor yok.{" "}
          {board.canEdit ? "“Düzenle” ile ekleyin." : ""}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {board.tiles.map((tile, i) => (
            <Tile key={`${tile.definitionId}-${i}`} tile={tile} />
          ))}
        </div>
      )}
    </>
  );
}

function Tile({ tile }: { tile: DashboardTileResult }) {
  return (
    <div className={tile.width === "full" ? "lg:col-span-2" : undefined}>
      <Panel
        title={tile.title}
        action={
          tile.result ? (
            <LinkButton href={`/reports/${tile.definitionId}`} size="sm">
              Raporu aç
            </LinkButton>
          ) : undefined
        }
      >
        {tile.error ? (
          // A broken tile says so where it stands. The other tiles ran.
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {tile.error}
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <ReportPreview result={tile.result!} title={tile.title} compact />
          </div>
        )}
      </Panel>
    </div>
  );
}

/**
 * The editor is a plain list rather than a canvas: pick a report, say how wide,
 * order with ↑/↓. Dragging tiles around a grid is what a dashboard builder is
 * expected to look like and it is also the part that never works on a phone.
 */
function DashboardEditor({
  board,
  onDone,
}: {
  board: DashboardRunResult;
  onDone: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState(board.name);
  const [isShared, setIsShared] = useState(board.isShared);
  const [tiles, setTiles] = useState<DashboardTile[]>(
    board.tiles.map((t) => ({
      definitionId: t.definitionId,
      width: t.width,
      ...(t.title ? { title: t.title } : {}),
    })),
  );

  const definitions = useQuery({
    queryKey: ["report-definitions"],
    queryFn: () =>
      apiGet<{ definitions: DefinitionSummary[] }>("/api/reports/definitions"),
  });

  const save = useMutation({
    mutationFn: () =>
      apiPatch(`/api/reports/dashboards/${board.id}`, {
        name: name.trim(),
        isShared,
        tiles,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["report-dashboard-run", board.id],
      });
      void queryClient.invalidateQueries({ queryKey: ["report-dashboards"] });
      onDone();
    },
  });

  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/reports/dashboards/${board.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["report-dashboards"] });
      router.push("/reports/dashboards");
    },
  });

  const update = (index: number, patch: Partial<DashboardTile>) =>
    setTiles(tiles.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  const move = (index: number, delta: number) => {
    const next = [...tiles];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setTiles(next);
  };

  const available = definitions.data?.definitions ?? [];
  const nameOf = (definitionId: string) =>
    available.find((d) => d.id === definitionId)?.name ?? definitionId;

  return (
    <div className="mb-4">
      <Panel title="Pano ayarları">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs text-neutral-500">Pano adı</span>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-64"
            aria-label="Pano adı"
          />
        </label>
        <Checkbox
          checked={isShared}
          onChange={(e) => setIsShared(e.target.checked)}
          label="Rapor kurabilen herkesle paylaş"
        />
      </div>

      <ul className="space-y-2">
        {tiles.map((tile, i) => (
          <li
            key={`${tile.definitionId}-${i}`}
            className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 p-2 dark:border-neutral-800"
          >
            <Select
              size="sm"
              value={tile.definitionId}
              aria-label="Rapor"
              className="w-64"
              onChange={(e) => update(i, { definitionId: e.target.value })}
            >
              {/* The report a tile already points at may be one this list does
                  not contain (it was deleted, or unshared). Keeping it as an
                  option stops the select silently rewriting the tile. */}
              {!available.some((d) => d.id === tile.definitionId) && (
                <option value={tile.definitionId}>
                  {nameOf(tile.definitionId)}
                </option>
              )}
              {available.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Select
              size="sm"
              value={tile.width}
              aria-label="Genişlik"
              className="w-auto"
              onChange={(e) =>
                update(i, { width: e.target.value as TileWidth })
              }
            >
              {(Object.keys(TILE_WIDTH_LABELS) as TileWidth[]).map((w) => (
                <option key={w} value={w}>
                  {TILE_WIDTH_LABELS[w]}
                </option>
              ))}
            </Select>
            <TextInput
              size="sm"
              value={tile.title ?? ""}
              placeholder="Başlık (ops.)"
              aria-label="Kart başlığı"
              className="w-44"
              onChange={(e) =>
                update(i, { title: e.target.value || undefined })
              }
            />
            <span className="ml-auto flex gap-1">
              <Button
                variant="secondary"
                size="sm"
                disabled={i === 0}
                aria-label="Yukarı taşı"
                onClick={() => move(i, -1)}
              >
                ↑
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={i === tiles.length - 1}
                aria-label="Aşağı taşı"
                onClick={() => move(i, 1)}
              >
                ↓
              </Button>
              <Button
                variant="secondary"
                size="sm"
                aria-label="Karti kaldır"
                onClick={() => setTiles(tiles.filter((_, x) => x !== i))}
              >
                ×
              </Button>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select
          size="sm"
          value=""
          aria-label="Rapor ekle"
          className="w-64"
          disabled={tiles.length >= 12}
          onChange={(e) => {
            if (!e.target.value) return;
            setTiles([
              ...tiles,
              { definitionId: e.target.value, width: "half" },
            ]);
          }}
        >
          <option value="">+ Rapor ekle…</option>
          {available.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Button
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={!name.trim()}
        >
          Kaydet
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Vazgeç
        </Button>
        <Button
          variant="danger"
          className="ml-auto"
          loading={remove.isPending}
          onClick={() => {
            if (confirm("Pano silinsin mi? Raporlar silinmez.")) {
              remove.mutate();
            }
          }}
        >
          Panoyu sil
        </Button>
      </div>

      <ErrorLine error={save.error ?? remove.error} />
      {tiles.length >= 12 && (
        <p className="mt-2 text-xs text-neutral-500">
          Bir panoda en fazla 12 rapor olabilir.
        </p>
      )}
      </Panel>
    </div>
  );
}
