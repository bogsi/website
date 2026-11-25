import type { Order, Status } from "../shared/orders";
import type { Bindings } from "./env";

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

type Template = { subject: string; lines: string[] };

// One message per status. The client gets an email on every status change.
const TEMPLATES: Record<Status, (o: Order) => Template> = {
  new: (o) => ({
    subject: `Your inquiry ${o.id} has been reopened`,
    lines: ["I have reopened your inquiry and will review it again shortly."],
  }),
  contacted: (o) => ({
    subject: `Update on your inquiry ${o.id}`,
    lines: [
      "I have reviewed your inquiry and will contact you shortly to schedule a call.",
      "If you prefer a specific time, just reply to this email.",
    ],
  }),
  quoted: (o) => ({
    subject: `Proposal for your inquiry ${o.id}`,
    lines: [
      "I have prepared a proposal for your request.",
      "If you have not received it yet or have questions about it, reply to this email.",
    ],
  }),
  won: (o) => ({
    subject: `Let's get started: ${o.id}`,
    lines: [
      "Thank you for choosing to work with me.",
      "I will follow up with the next steps and a kickoff date.",
    ],
  }),
  lost: (o) => ({
    subject: `Closing your inquiry ${o.id}`,
    lines: [
      "Thank you for considering me for this work. I am closing this inquiry for now.",
      "If anything changes, reply to this email and I will gladly pick it up again.",
    ],
  }),
  in_progress: (o) => ({
    subject: `Work has started: ${o.id}`,
    lines: ["Work on your request has started. I will keep you posted on progress."],
  }),
  done: (o) => ({
    subject: `Completed: ${o.id}`,
    lines: [
      "Work on your request is complete. Thank you for the collaboration.",
      "If you need anything else, just reply to this email.",
    ],
  }),
};

export function statusEmail(order: Order, status: Status): { subject: string; html: string } {
  const t = TEMPLATES[status](order);
  const name = escapeHtml(order.full_name);
  const html = `
    <p>Hi ${name},</p>
    ${t.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n    ")}
    <hr>
    <p><strong>Order ID:</strong> ${escapeHtml(order.id)}<br>
       <strong>Service:</strong> ${escapeHtml(order.aws_service)}</p>
    <p>Best regards,<br>Bogomil Roussev<br>AWS &amp; Terraform Automation Consultant</p>
  `;
  return { subject: t.subject, html };
}

/** Sends the status email to the client; throws with Resend's answer on failure. */
export async function sendStatusEmail(env: Bindings, order: Order, status: Status): Promise<void> {
  if (!env.RESEND_API_KEY || !env.FROM_EMAIL) {
    throw new Error("RESEND_API_KEY or FROM_EMAIL is not set");
  }
  const { subject, html } = statusEmail(order, status);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: order.email,
      ...(env.ADMIN_EMAIL ? { reply_to: env.ADMIN_EMAIL } : {}),
      subject,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}
