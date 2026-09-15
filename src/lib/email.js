import { formatDateTime, formatMAD } from '@/lib/format';
import { whatsappLink, bookingConfirmedMessage } from '@/lib/whatsapp';

/**
 * Booking e-mail via Resend (free tier: 3,000/month).
 *
 * Two messages, deliberately different:
 *
 *   AGENCY — always French, because that is the language the counter works in,
 *     and dense: every field needed to confirm without opening the admin. The
 *     customer's phone is a wa.me LINK, so answering is one tap from the
 *     notification rather than a copy-paste (Diab Car confirms on WhatsApp —
 *     plan 9.5, no online payment).
 *
 *   CUSTOMER — in THEIR language, calm, and careful about what it promises:
 *     it says the request was received and what happens next, never "confirmed".
 *     Confirming is the agency's job.
 *
 * Both carry a plain-text alternative. HTML-only mail is what spam filters
 * punish, and the text part is what a watch or a screen reader actually reads.
 *
 * With no RESEND_API_KEY the message is logged instead of sent, so `npm run
 * dev` shows exactly what would have gone out rather than silently doing
 * nothing.
 */

const RED = '#c80018';
const INK = '#0a0a0a';
const MUTED = '#5c5c5c';

export async function sendBookingEmails({ booking, vehicle, settings }) {
  const locale = booking.locale || 'fr';
  const name = vehicle ? `${vehicle.brand} ${vehicle.model}${vehicle.year ? ` ${vehicle.year}` : ''}` : '—';
  const q = booking.priceBreakdown || {};

  const agency = buildAgencyEmail({ booking, name, q, settings });
  const customer = booking.customerEmail ? buildCustomerEmail({ booking, name, q, settings, locale }) : null;

  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === 'production') {
      /* A deployed build logs only THAT nothing was sent. The full message holds
         the customer's name, phone and e-mail, and the host's logs are no place
         for a client's personal data. */
      console.warn(`[email] RESEND_API_KEY not set — booking e-mails not sent (reference ${booking.reference || booking.id || 'n/a'}).`);
    } else {
      /* Not silent: the whole point of the dev path is to see the content. */
      console.info(`[email] RESEND_API_KEY not set — nothing sent. Would have delivered:\n` + `  → agency (${process.env.BOOKING_NOTIFY_EMAIL || settings?.email || 'unset'}): ${agency.subject}\n` + (customer ? `  → customer (${booking.customerEmail}): ${customer.subject}\n` : '') + `\n${agency.text}\n`);
    }
    return { skipped: true, reason: 'no-api-key' };
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.EMAIL_FROM || 'Diab Car <reservations@diabcar.ma>';
    const notify = process.env.BOOKING_NOTIFY_EMAIL || settings?.email;

    const jobs = [];
    if (notify) jobs.push(resend.emails.send({ from, to: notify, replyTo: booking.customerEmail || undefined, ...agency }));
    if (customer) jobs.push(resend.emails.send({ from, to: booking.customerEmail, ...customer }));

    const results = await Promise.allSettled(jobs);
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) console.error('[email] some messages failed:', failed.map((f) => f.reason?.message || f.reason));
    return { ok: failed.length === 0, sent: results.length - failed.length };
  } catch (error) {
    console.error('[email]', error);
    return { ok: false, error: error.message };
  }
}

/* ------------------------------------------------------------------ */
/* Agency                                                              */
/* ------------------------------------------------------------------ */

function buildAgencyEmail({ booking, name, q, settings }) {
  const phone = booking.customerPhone || '';
  const wa = phone ? whatsappLink(phone, bookingConfirmedMessage('fr', {
    reference: booking.reference,
    vehicleName: name,
    from: formatDateTime(booking.startAt, 'fr'),
    to: formatDateTime(booking.endAt, 'fr'),
    pickup: booking.pickupLabel,
    dropoff: booking.dropoffLabel,
    total: formatMAD(booking.totalMad, 'fr'),
  })) : null;

  const rows = [
    ['Référence', booking.reference],
    ['Véhicule', name],
    ['Prise en charge', `${booking.pickupLabel || '—'} — ${formatDateTime(booking.startAt, 'fr')}`],
    ['Restitution', `${booking.dropoffLabel || '—'} — ${formatDateTime(booking.endAt, 'fr')}`],
    ['Vol', booking.flightNumber || '—'],
    ['Options', (q.extras || []).map((e) => `${e.name || e.key} ×${e.qty}`).join(', ') || '—'],
    ['Location', q.days ? `${formatMAD(q.basePerDay, 'fr')} × ${q.days} = ${formatMAD(q.subtotal, 'fr')}` : '—'],
    ['Remise', q.discountAmount ? `− ${formatMAD(q.discountAmount, 'fr')} (${q.discountPct}%)` : '—'],
    /* « Sur devis » is not 0 MAD. When the place carries no price the total
       deliberately excludes the delivery (rule 4: nothing is charged that was
       not shown), so the counter has to be told a figure is still owed --
       printing 0 reads as "free" and the fee is never collected. */
    ['Livraison', q.deliveryOnRequest ? 'À DEVIS — non incluse dans le total' : formatMAD(q.deliveryFee || 0, 'fr')],
    ['Aller simple', formatMAD(q.oneWayFee || 0, 'fr')],
    ['TOTAL affiché', formatMAD(booking.totalMad, 'fr')],
    ['Caution', formatMAD(q.deposit, 'fr')],
    ['Client', booking.customerName || '—'],
    ['Téléphone', phone || '—'],
    ['E-mail', booking.customerEmail || '—'],
    ['Message', booking.notes || '—'],
    ['Langue du client', booking.locale || 'fr'],
  ];

  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;color:${INK};font-family:Helvetica Neue,Arial,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:32px 24px">
<p style="margin:0 0 4px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${MUTED}">Diab Car</p>
<h1 style="margin:0;font-size:22px;font-weight:800">Nouvelle demande ${escapeHtml(booking.reference)}</h1>
<div style="height:2px;width:64px;background:${RED};margin:14px 0 22px"></div>
${wa ? `<p style="margin:0 0 22px"><a href="${wa}" style="display:inline-block;background:${RED};color:#fff;text-decoration:none;padding:12px 20px;font-weight:700;font-size:14px">Répondre sur WhatsApp</a></p>` : ''}
<table style="border-collapse:collapse;font-size:14px;width:100%">${rows
    .map(([k, v]) => `<tr><td style="padding:7px 16px 7px 0;color:${MUTED};white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td><td style="padding:7px 0;font-weight:600">${escapeHtml(String(v))}</td></tr>`)
    .join('')}</table>
<p style="margin:24px 0 0;color:${MUTED};font-size:12px">Aucun paiement en ligne. Encaissement à la prise en charge (espèces ou TPE).</p>
</div></body></html>`;

  const text = [
    `DIAB CAR — nouvelle demande ${booking.reference}`,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    wa ? `Répondre sur WhatsApp: ${wa}` : '',
    'Aucun paiement en ligne. Encaissement à la prise en charge (espèces ou TPE).',
  ]
    .filter(Boolean)
    .join('\n');

  return { subject: `Nouvelle demande ${booking.reference} — ${name}`, html, text };
}

/* ------------------------------------------------------------------ */
/* Customer                                                            */
/* ------------------------------------------------------------------ */

const COPY = {
  fr: {
    subject: (r) => `Votre demande ${r} — Diab Car`,
    kicker: 'Demande reçue',
    title: (r) => `Demande ${r}`,
    intro: (m) => `Merci. Votre demande est enregistrée. Nous vérifions la disponibilité et vous confirmons sur WhatsApp sous ${m} minutes pendant nos horaires d’ouverture.`,
    labels: { car: 'Véhicule', pickup: 'Prise en charge', dropoff: 'Restitution', total: 'Total affiché', deposit: 'Caution' },
    payment: 'Paiement à la prise en charge : espèces ou carte bancaire (TPE). Aucun paiement en ligne.',
    notConfirmed: 'Cette demande n’est pas encore une réservation confirmée : notre équipe vous répond pour la valider.',
  },
  en: {
    subject: (r) => `Your request ${r} — Diab Car`,
    kicker: 'Request received',
    title: (r) => `Request ${r}`,
    intro: (m) => `Thank you. Your request is recorded. We are checking availability and will confirm on WhatsApp within ${m} minutes during opening hours.`,
    labels: { car: 'Vehicle', pickup: 'Pick-up', dropoff: 'Return', total: 'Total shown', deposit: 'Deposit' },
    payment: 'Payment on pick-up: cash or bank card (card terminal). No online payment.',
    notConfirmed: 'This request is not a confirmed booking yet — our team will reply to validate it.',
  },
  ar: {
    subject: (r) => `طلبكم ${r} — Diab Car`,
    kicker: 'تم استلام الطلب',
    title: (r) => `الطلب ${r}`,
    intro: (m) => `شكراً لكم. تم تسجيل طلبكم. نتحقق من التوفر ونؤكد لكم عبر واتساب خلال ${m} دقيقة خلال ساعات العمل.`,
    labels: { car: 'السيارة', pickup: 'الاستلام', dropoff: 'الإرجاع', total: 'المجموع المعروض', deposit: 'الضمان' },
    payment: 'الأداء عند الاستلام: نقداً أو بالبطاقة البنكية. لا يوجد أداء عبر الإنترنت.',
    notConfirmed: 'هذا الطلب ليس حجزاً مؤكداً بعد — سيتواصل معكم فريقنا لتأكيده.',
  },
  es: {
    subject: (r) => `Su solicitud ${r} — Diab Car`,
    kicker: 'Solicitud recibida',
    title: (r) => `Solicitud ${r}`,
    intro: (m) => `Gracias. Su solicitud está registrada. Estamos comprobando la disponibilidad y le confirmaremos por WhatsApp en ${m} minutos durante el horario de apertura.`,
    labels: { car: 'Vehículo', pickup: 'Recogida', dropoff: 'Devolución', total: 'Total mostrado', deposit: 'Fianza' },
    payment: 'Pago en la recogida: efectivo o tarjeta bancaria (TPV). Sin pago en línea.',
    notConfirmed: 'Esta solicitud todavía no es una reserva confirmada: nuestro equipo le responderá para validarla.',
  },
};

function buildCustomerEmail({ booking, name, q, settings, locale }) {
  const c = COPY[locale] || COPY.fr;
  const rtl = locale === 'ar';
  const minutes = settings?.responseTime || 10;

  const rows = [
    [c.labels.car, name],
    [c.labels.pickup, `${booking.pickupLabel || '—'} — ${formatDateTime(booking.startAt, locale)}`],
    [c.labels.dropoff, `${booking.dropoffLabel || '—'} — ${formatDateTime(booking.endAt, locale)}`],
    [c.labels.total, formatMAD(booking.totalMad, locale)],
    [c.labels.deposit, formatMAD(q.deposit, locale)],
  ];

  const html = `<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}"><body style="margin:0;background:#ffffff;color:${INK};font-family:Helvetica Neue,Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:32px 24px;text-align:${rtl ? 'right' : 'left'}">
<p style="margin:0 0 4px;font-size:11px;letter-spacing:${rtl ? 'normal' : '.12em'};text-transform:${rtl ? 'none' : 'uppercase'};color:${MUTED}">${escapeHtml(c.kicker)}</p>
<h1 style="margin:0;font-size:22px;font-weight:800">${escapeHtml(c.title(booking.reference))}</h1>
<div style="height:2px;width:64px;background:${RED};margin:14px 0 22px"></div>
<p style="margin:0 0 22px;font-size:15px;line-height:1.6">${escapeHtml(c.intro(minutes))}</p>
<table style="border-collapse:collapse;font-size:14px;width:100%">${rows
    .map(([k, v]) => `<tr><td style="padding:7px 16px 7px 0;color:${MUTED};vertical-align:top">${escapeHtml(k)}</td><td style="padding:7px 0;font-weight:600">${escapeHtml(String(v))}</td></tr>`)
    .join('')}</table>
<p style="margin:22px 0 0;font-size:13px;color:${MUTED}">${escapeHtml(c.payment)}</p>
<p style="margin:10px 0 0;font-size:13px;color:${MUTED}">${escapeHtml(c.notConfirmed)}</p>
<p style="margin:26px 0 0;color:${MUTED};font-size:12px">${escapeHtml(settings?.legalName || 'DIAB CAR SARL')} · ${escapeHtml(settings?.addressLine || '')}${settings?.city ? `, ${escapeHtml(settings.city)}` : ''}</p>
</div></body></html>`;

  const text = [
    `${c.kicker} — ${c.title(booking.reference)}`,
    '',
    c.intro(minutes),
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    c.payment,
    c.notConfirmed,
  ].join('\n');

  return { subject: c.subject(booking.reference), html, text };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
