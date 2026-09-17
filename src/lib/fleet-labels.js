/**
 * French labels for the fleet vocabulary, shared by server and client admin
 * components (plan 7.1). One copy: the model page, the editor and the unit
 * dossier used to each carry their own, and three copies of "SUV & 4x4" are
 * three places for one wording to drift.
 *
 * The keys mirror the enums in supabase/migrations/0001 (vehicle categories,
 * `block_kind`). An unknown key falls back to itself at the call site.
 */

export const CATEGORY_LABEL = {
  economy: 'Citadine',
  compact: 'Compacte',
  sedan: 'Berline',
  suv: 'SUV & 4x4',
  premium: 'Premium',
  luxury: 'Luxe',
  van: 'Van & minibus',
};

export const BLOCK_KIND_LABEL = {
  maintenance: 'Maintenance',
  cleaning: 'Nettoyage',
  transfer: 'Transfert',
  private: 'Usage interne',
  other: 'Autre',
};

/** A physical car's status (units.status), as the admin prints it. */
export const UNIT_STATUS_LABEL = {
  available: 'Disponible',
  reserved: 'Réservée',
  rented: 'En location',
  returned: 'Rendue',
  cleaning: 'Nettoyage',
  maintenance: 'Entretien',
  blocked: 'Bloquée',
  out_of_service: 'Hors service',
};

/** Where a booking came from (reservations.source). */
export const RESERVATION_SOURCE_LABEL = {
  web: 'site web',
  walkin: 'comptoir',
  phone: 'téléphone',
  whatsapp: 'WhatsApp',
  admin: 'interne',
};

/** The category as the admin prints it, or the raw key when it is unknown. */
export function categoryLabel(key) {
  return CATEGORY_LABEL[key] || key || '';
}
