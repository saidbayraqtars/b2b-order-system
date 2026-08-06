"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import type { AgentRow, IssuedAgent } from "@repo/services";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import { Button, ErrorLine, Label, Panel, TextInput } from "@/components/form";
import { Badge, EmptyState, LoadingState } from "@/components/ui";

// Ajanlar ve kimlikleri.
//
// The token is shown once, right here, in the response to the call that created
// or rotated it. It is stored hashed, so there is no endpoint anywhere that can
// show it a second time — losing it means rotating it, which is the honest
// trade for a database leak not handing over the ability to rewrite stock.

export function AgentsPanel() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [issued, setIssued] = useState<IssuedAgent | null>(null);

  const query = useQuery({
    queryKey: ["erp-agents"],
    queryFn: () => apiGet<{ agents: AgentRow[] }>("/api/admin/erp/agents"),
  });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["erp-agents"] });

  const create = useMutation({
    mutationFn: () =>
      apiPost<IssuedAgent>("/api/admin/erp/agents", { name: name.trim(), erp: "vega" }),
    onSuccess: (agent) => {
      setName("");
      setIssued(agent);
      invalidate();
    },
  });

  return (
    <Panel title="Ajanlar">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label>
          <Label hint="hangi makinede çalışacaksa">Ajan adı</Label>
          <TextInput
            value={name}
            placeholder="Merkez sunucu"
            onChange={(e) => setName(e.target.value)}
            className="w-56"
          />
        </label>
        <Button
          disabled={create.isPending || name.trim().length === 0}
          onClick={() => create.mutate()}
        >
          Ajan aç
        </Button>
      </div>
      <ErrorLine error={create.error} />

      {issued && <TokenOnce agent={issued} onDismiss={() => setIssued(null)} />}

      {query.isLoading && <LoadingState />}
      <ErrorLine error={query.error} />

      {query.data &&
        (query.data.agents.length === 0 ? (
          <EmptyState label="Henüz ajan yok — ERP'den veri gelmesi için bir tane açın." />
        ) : (
          <ul className="space-y-2">
            {query.data.agents.map((agent) => (
              <AgentItem
                key={agent.id}
                agent={agent}
                onChanged={invalidate}
                onRotated={setIssued}
              />
            ))}
          </ul>
        ))}
    </Panel>
  );
}

/** The one and only time this token is visible. */
function TokenOnce({
  agent,
  onDismiss,
}: {
  agent: IssuedAgent;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
        {agent.name} için token — bu ekranı kapatınca bir daha gösterilmez
      </p>
      <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
        Ajanın <code>agent.config.json</code> dosyasındaki <code>token</code>{" "}
        alanına yazın. Kaybederseniz yenileyin; eskisi anında geçersiz olur.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-lg bg-white px-3 py-2 font-mono text-xs dark:bg-neutral-900">
          {agent.token}
        </code>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(agent.token);
            setCopied(true);
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? "Kopyalandı" : "Kopyala"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Kapat
        </Button>
      </div>
    </div>
  );
}

function AgentItem({
  agent,
  onChanged,
  onRotated,
}: {
  agent: AgentRow;
  onChanged: () => void;
  onRotated: (agent: IssuedAgent) => void;
}) {
  const toggle = useMutation({
    mutationFn: () =>
      apiPatch(`/api/admin/erp/agents/${agent.id}`, { isActive: !agent.isActive }),
    onSuccess: onChanged,
  });
  const rotate = useMutation({
    mutationFn: () =>
      apiPost<IssuedAgent>(`/api/admin/erp/agents/${agent.id}/rotate`, {}),
    onSuccess: (issued) => {
      onRotated(issued);
      onChanged();
    },
  });
  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/admin/erp/agents/${agent.id}`),
    onSuccess: onChanged,
  });

  return (
    <li className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <p className="flex items-center gap-2 font-medium">
            {agent.name}
            <Badge tone="info">{agent.erp}</Badge>
            {!agent.isActive && <Badge tone="neutral">Kapalı</Badge>}
          </p>
          <p className="text-neutral-500">
            {agent.lastSeenAt
              ? `Son görülme ${new Date(agent.lastSeenAt).toLocaleString("tr-TR")}`
              : "Hiç bağlanmadı"}
            {agent.lastSeenIp ? ` · ${agent.lastSeenIp}` : ""}
            {agent.tokenHint ? ` · token …${agent.tokenHint}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={rotate.isPending}
            onClick={() => rotate.mutate()}
          >
            Token yenile
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={toggle.isPending}
            onClick={() => toggle.mutate()}
          >
            {agent.isActive ? "Kapat" : "Aç"}
          </Button>
          <Button
            size="sm"
            variant="danger"
            loading={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Sil
          </Button>
        </div>
      </div>
      <ErrorLine error={toggle.error ?? rotate.error ?? remove.error} />
    </li>
  );
}
