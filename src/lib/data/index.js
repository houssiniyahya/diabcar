import { isSupabaseConfigured } from '@/lib/auth/session';
import { publishable } from '@/lib/faq';
import { demoAdapter } from './demo-adapter';

/**
 * Single data access point. Supabase when configured, otherwise the in-memory
 * demo store so the whole app (site + admin) runs with zero configuration.
 */
let adapter;
export async function db() {
  if (adapter) return adapter;
  if (isSupabaseConfigured()) {
    const { supabaseAdapter } = await import('./supabase-adapter');
    adapter = supabaseAdapter;
  } else {
    adapter = demoAdapter;
  }
  return adapter;
}

export function dataMode() {
  return isSupabaseConfigured() ? 'supabase' : 'demo';
}

/* Convenience wrappers used across the site */
export const getSettings = async () => (await db()).getSettings();
/** Full settings row including internal fields. Staff only — admin pages and
    server routes, never a public page (see supabase/migrations/0005). */
export const getSettingsAdmin = async () => (await db()).getSettingsAdmin();
export const listVehicles = async (f) => (await db()).listVehicles(f);
export const getVehicleBySlug = async (slug) => (await db()).getVehicleBySlug(slug);
/* The options travel through: `{ asStaff: true }` is what lets the admin open
   a DRAFT model. Dropped here, the Supabase adapter read with the anonymous
   client, RLS hid the unpublished row, and the model page answered 404. */
export const getVehicleById = async (id, opts) => (await db()).getVehicleById(id, opts);
export const listSeasons = async () => (await db()).listSeasons();
export const listExtras = async () => (await db()).listExtras();
export const listLocations = async () => (await db()).listLocations();
/**
 * FAQ rows, with unfinished ones withheld from the public site.
 *
 * `docs/inputs/faq.csv` is a template whose answers all read "TODO — réponse
 * complète" until Diab Car writes them. One such row was published in the live
 * database and rendered on seven public pages AND inside the FAQPage structured
 * data, where it would have been indexed as the agency's own answer.
 * Rule 11: unverified is hidden, not shown.
 *
 * Filtered here rather than in a page, because five public callers read these
 * rows — the FAQ page, the homepage block, the airport, long-term and vehicle
 * pages — and a guard in one protects only one. `asStaff` passes everything
 * through untouched: the admin is the one place these must stay visible, or the
 * owner can never find the ones still to write.
 */
export const listFaqs = async (f) => {
  const rows = await (await db()).listFaqs(f);
  return f?.asStaff ? rows : publishable(rows);
};
export const listPosts = async (f) => (await db()).listPosts(f);
export const getPostBySlug = async (slug) => (await db()).getPostBySlug(slug);
export const listReviews = async (f) => (await db()).listReviews(f);
export const createBooking = async (d) => (await db()).createBooking(d);
export const getBooking = async (id) => (await db()).getBooking(id);

/* Fleet operations (plan 6.1). Identical surface in both adapters, so the app
   never branches on which one is live. */
export const listUnits = async (f) => (await db()).listUnits(f);
export const getUnit = async (id) => (await db()).getUnit(id);
export const listCustomers = async (f) => (await db()).listCustomers(f);
export const upsertCustomer = async (d) => (await db()).upsertCustomer(d);
export const listReservations = async (f) => (await db()).listReservations(f);
export const getReservation = async (id) => (await db()).getReservation(id);
export const createReservation = async (d) => (await db()).createReservation(d);
export const updateReservation = async (id, p) => (await db()).updateReservation(id, p);
export const listBlocks = async (f) => (await db()).listBlocks(f);
export const createBlock = async (d) => (await db()).createBlock(d);
export const deleteBlock = async (id, reason) => (await db()).deleteBlock(id, reason);
export const listHolds = async (f) => (await db()).listHolds(f);
export const createHold = async (d) => (await db()).createHold(d);
export const releaseHold = async (id) => (await db()).releaseHold(id);
export const listEvents = async (f) => (await db()).listEvents(f);
export const createEvent = async (d) => (await db()).createEvent(d);

/* Notifications (plan 7.4) — the admin bell. */
export const listNotifications = async (f) => (await db()).listNotifications(f);
export const createNotification = async (d) => (await db()).createNotification(d);
export const markNotificationRead = async (id) => (await db()).markNotificationRead(id);

/* Journal (plan 7.1) and the dashboard strip. */
export const listAuditLog = async (f) => (await db()).listAuditLog(f);
export const getFleetSnapshot = async () => (await db()).getFleetSnapshot();

/* Operational writes (plan 7.1). Each is one RPC so the audit reason travels
   in the same transaction as the write — see supabase/migrations/0010. */
export const setReservationStatus = async (a) => (await db()).setReservationStatus(a);
export const assignReservationUnit = async (a) => (await db()).assignReservationUnit(a);
export const moveReservation = async (a) => (await db()).moveReservation(a);
export const overrideReservationPrice = async (a) => (await db()).overrideReservationPrice(a);
export const unitsFreeForReservation = async (id) => (await db()).unitsFreeForReservation(id);
export const getCalendar = async (a) => (await db()).getCalendar(a);
export const getCustomerProfile = async (id) => (await db()).getCustomerProfile(id);
export const listCustomerDuplicates = async () => (await db()).listCustomerDuplicates();
export const mergeCustomers = async (a) => (await db()).mergeCustomers(a);
export const setCustomerNotes = async (a) => (await db()).setCustomerNotes(a);

/* ---------------------------------------------------------------- prompt 12 */
/* Fleet */
export const upsertVehicle = async (d, reason) => (await db()).upsertVehicle(d, reason);
export const deleteVehicle = async (id) => (await db()).deleteVehicle(id);
export const listVehiclePhotos = async (f) => (await db()).listVehiclePhotos(f);
export const saveVehiclePhoto = async (d) => (await db()).saveVehiclePhoto(d);
export const deleteVehiclePhoto = async (id) => (await db()).deleteVehiclePhoto(id);
export const reorderVehiclePhotos = async (a) => (await db()).reorderVehiclePhotos(a);
export const upsertUnit = async (d, reason) => (await db()).upsertUnit(d, reason);
export const setUnitStatus = async (a) => (await db()).setUnitStatus(a);
export const getUnitDossier = async (id) => (await db()).getUnitDossier(id);

/* Operations */
export const getVehicleCalendar = async (a) => (await db()).getVehicleCalendar(a);
export const getOperationsDay = async (day) => (await db()).getOperationsDay(day);
export const completePickup = async (a) => (await db()).completePickup(a);
export const completeReturn = async (a) => (await db()).completeReturn(a);
export const markUnitReady = async (a) => (await db()).markUnitReady(a);

/* Content, prices, places */
export const upsertFaq = async (d) => (await db()).upsertFaq(d);
export const deleteFaq = async (id) => (await db()).deleteFaq(id);
export const upsertPost = async (d) => (await db()).upsertPost(d);
export const deletePost = async (id) => (await db()).deletePost(id);
export const getPostById = async (id) => (await db()).getPostById(id);
export const upsertReview = async (d) => (await db()).upsertReview(d);
export const deleteReview = async (id) => (await db()).deleteReview(id);
export const upsertSeason = async (d, reason) => (await db()).upsertSeason(d, reason);
export const deleteSeason = async (id, reason) => (await db()).deleteSeason(id, reason);
export const upsertExtra = async (d, reason) => (await db()).upsertExtra(d, reason);
export const deleteExtra = async (id, reason) => (await db()).deleteExtra(id, reason);
export const upsertLocation = async (d, reason) => (await db()).upsertLocation(d, reason);
export const deleteLocation = async (id, reason) => (await db()).deleteLocation(id, reason);
export const updateSettings = async (patch, reason) => (await db()).updateSettings(patch, reason);

/* Système */
export const getSystemMetrics = async () => (await db()).getSystemMetrics();
export const expireUnconfirmedReservations = async () => (await db()).expireUnconfirmedReservations();
export const refreshCleaningBlocks = async () => (await db()).refreshCleaningBlocks();

/* Availability (plan 6.3/6.4). Postgres decides; these only ask.
   The adapters share one shape so the funnel never branches on the backend. */
export const searchAvailability = async (a) => (await db()).searchAvailability(a);
export const nextAvailable = async (a) => (await db()).nextAvailable(a);
export const holdVehicle = async (a) => (await db()).holdVehicle(a);
export const releaseVehicleHold = async (a) => (await db()).releaseVehicleHold(a);
export const bookVehicle = async (p, o) => (await db()).bookVehicle(p, o);

export { CATEGORIES, TRANSMISSIONS, FUELS, FEATURES, BOOKING_STATUSES, CAR_IMAGES, LOCALES, t, vehicleImage } from '@/lib/constants';
