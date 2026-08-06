import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@repo/database";
import { BusinessError } from "./errors";

// ERP ajanının kimliği.
//
// The agent is not a person: it is a process on the customer's own machine that
// reads their ERP and posts what it found. So it does not get a session — it
// gets a bearer token, and this file is everything that token can do.
//
// Three rules, each here for a reason:
//
//  1. **Only the hash is stored.** The token is shown once, at issue, and never
//     again — the same treatment PasswordResetToken gets. A leaked database
//     must not hand over the ability to rewrite stock and prices.
//  2. **The lookup is by hash, and the comparison is constant-time.** Tokens are
//     high-entropy, so this matters less than it does for passwords, but the
//     cost is one function call.
//  3. **An agent authorises nothing but ingest.** It cannot read customers, it
//     cannot place orders, it cannot see the till. `requireAgent` is used only
//     by the /api/erp routes, and those only write what this module's ingest
//     side knows how to apply.

const TOKEN_BYTES = 32;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface IssuedAgent {
  id: string;
  name: string;
  /**
   * The plaintext token. Returned exactly once, by the call that created or
   * rotated it, and never retrievable again — if it is lost, it is rotated.
   */
  token: string;
}

export interface AgentRow {
  id: string;
  name: string;
  erp: string;
  tokenHint: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  lastSeenIp: string | null;
  createdAt: string;
  /** Runs this agent has posted, newest first, for the admin screen. */
  lastRunAt: string | null;
}

export async function createErpAgent(name: string, erp = "vega"): Promise<IssuedAgent> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const trimmed = name.trim();
  if (!trimmed) {
    throw new BusinessError("INVALID_UPLOAD", "Ajan adı gerekli");
  }

  const existing = await prisma.erpAgent.findUnique({
    where: { name: trimmed },
    select: { id: true },
  });
  if (existing) {
    throw new BusinessError("ERP_AGENT_NAME_TAKEN", "Bu isimde bir ajan zaten var");
  }

  const agent = await prisma.erpAgent.create({
    data: {
      name: trimmed,
      erp: erp.trim() || "vega",
      tokenHash: hashToken(token),
      tokenHint: token.slice(-4),
    },
    select: { id: true, name: true },
  });

  return { id: agent.id, name: agent.name, token };
}

/**
 * Replace an agent's token.
 *
 * The old one stops working the moment this returns — there is no grace period
 * on purpose. Rotation happens because a token leaked or a machine was
 * replaced, and in both cases "the old one keeps working for a while" is
 * exactly what must not happen.
 */
export async function rotateErpAgentToken(id: string): Promise<IssuedAgent> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const agent = await prisma.erpAgent
    .update({
      where: { id },
      data: { tokenHash: hashToken(token), tokenHint: token.slice(-4) },
      select: { id: true, name: true },
    })
    .catch(() => null);
  if (!agent) {
    throw new BusinessError("ERP_AGENT_NOT_FOUND", "Ajan bulunamadı");
  }
  return { id: agent.id, name: agent.name, token };
}

export async function setErpAgentActive(id: string, isActive: boolean): Promise<void> {
  const updated = await prisma.erpAgent
    .update({ where: { id }, data: { isActive }, select: { id: true } })
    .catch(() => null);
  if (!updated) {
    throw new BusinessError("ERP_AGENT_NOT_FOUND", "Ajan bulunamadı");
  }
}

export async function deleteErpAgent(id: string): Promise<void> {
  const deleted = await prisma.erpAgent
    .delete({ where: { id }, select: { id: true } })
    .catch(() => null);
  if (!deleted) {
    throw new BusinessError("ERP_AGENT_NOT_FOUND", "Ajan bulunamadı");
  }
}

export async function listErpAgents(): Promise<AgentRow[]> {
  const rows = await prisma.erpAgent.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      erp: true,
      tokenHint: true,
      isActive: true,
      lastSeenAt: true,
      lastSeenIp: true,
      createdAt: true,
      runs: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { startedAt: true },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    erp: r.erp,
    tokenHint: r.tokenHint,
    isActive: r.isActive,
    lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
    lastSeenIp: r.lastSeenIp,
    createdAt: r.createdAt.toISOString(),
    lastRunAt: r.runs[0]?.startedAt.toISOString() ?? null,
  }));
}

export interface AuthenticatedAgent {
  id: string;
  name: string;
  erp: string;
}

/**
 * Resolve the bearer token on an agent request, or refuse.
 *
 * A disabled agent is refused the same way an unknown one is: revoking access
 * has to be immediate and total, and distinguishing the two would tell whoever
 * holds a stale token that it was once real.
 */
export async function authenticateAgent(
  token: string | null,
  meta: { ip?: string | null } = {},
): Promise<AuthenticatedAgent | null> {
  if (!token || token.length < 16) return null;

  const agent = await prisma.erpAgent.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, name: true, erp: true, isActive: true, tokenHash: true },
  });
  if (!agent || !agent.isActive) return null;

  // The lookup above already matched on the hash; this is the constant-time
  // confirmation, so a future change to the lookup cannot quietly turn this
  // into a short-circuiting comparison.
  const provided = Buffer.from(hashToken(token), "hex");
  const stored = Buffer.from(agent.tokenHash, "hex");
  if (provided.length !== stored.length || !timingSafeEqual(provided, stored)) {
    return null;
  }

  await prisma.erpAgent.update({
    where: { id: agent.id },
    data: { lastSeenAt: new Date(), lastSeenIp: meta.ip ?? null },
  });

  return { id: agent.id, name: agent.name, erp: agent.erp };
}
