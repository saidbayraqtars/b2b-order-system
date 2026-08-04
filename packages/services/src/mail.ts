import nodemailer, { type Transporter } from "nodemailer";

// Outbound e-mail.
//
// Two transports, chosen by the environment rather than by a flag someone has to
// remember: if SMTP_HOST is set the mail goes out over SMTP, otherwise it is
// written to the log. The console transport is not a stub — it is what a
// developer (and a CI run) should get, so the password-reset flow can be walked
// end to end without a mail account, and nothing is silently swallowed.
//
// Sending never throws at the caller. A failed notification must not roll back
// the order it was announcing; the failure is logged and, where it matters,
// recorded in the audit trail by the caller.

export interface MailMessage {
  to: string | string[];
  subject: string;
  /** Plain-text body. Always sent — some clients never render the HTML. */
  text: string;
  html?: string;
}

export type MailTransportKind = "smtp" | "console";

export interface MailResult {
  ok: boolean;
  transport: MailTransportKind;
  /** Provider message id when there is one. */
  messageId?: string;
  error?: string;
}

let cached: Transporter | null = null;

function fromAddress(): string {
  return process.env.MAIL_FROM ?? "B2B <no-reply@b2b.local>";
}

export function mailTransportKind(): MailTransportKind {
  return process.env.SMTP_HOST ? "smtp" : "console";
}

function transporter(): Transporter {
  if (cached) return cached;

  const port = Number(process.env.SMTP_PORT ?? 587);
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; 587 upgrades with STARTTLS. Overridable because some
    // providers do their own thing.
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === "true"
      : port === 465,
    ...(process.env.SMTP_USER
      ? {
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD ?? "",
          },
        }
      : {}),
  });
  return cached;
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const recipients = Array.isArray(message.to) ? message.to : [message.to];
  const to = recipients.filter((r) => r && r.includes("@"));
  if (to.length === 0) {
    return { ok: false, transport: mailTransportKind(), error: "Alıcı yok" };
  }

  if (mailTransportKind() === "console") {
    console.warn(
      [
        "── E-POSTA (konsol taşıyıcısı — SMTP_HOST tanımlı değil) ──",
        `Kime : ${to.join(", ")}`,
        `Konu : ${message.subject}`,
        message.text,
        "──────────────────────────────────────────────",
      ].join("\n"),
    );
    return { ok: true, transport: "console" };
  }

  try {
    const info = await transporter().sendMail({
      from: fromAddress(),
      to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });
    return { ok: true, transport: "smtp", messageId: info.messageId };
  } catch (err) {
    console.error("E-posta gönderilemedi", err);
    return {
      ok: false,
      transport: "smtp",
      error: err instanceof Error ? err.message : "bilinmeyen hata",
    };
  }
}

/** Where links in e-mails point. */
export function appUrl(path = ""): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return path ? `${base}${path.startsWith("/") ? path : `/${path}`}` : base;
}
