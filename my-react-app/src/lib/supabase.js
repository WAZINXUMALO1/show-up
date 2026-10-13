const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const sessionKey = "showup-auth-session";

export const isBackendConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function readSession() {
  if (!isBackendConfigured) return null;
  const value = sessionStorage.getItem(sessionKey);
  return value ? JSON.parse(value) : null;
}

function saveSession(session) {
  if (!isBackendConfigured) return;
  if (session) sessionStorage.setItem(sessionKey, JSON.stringify(session));
  else sessionStorage.removeItem(sessionKey);
}

async function authRequest(path, body, accessToken) {
  if (!isBackendConfigured) throw new Error("Authentication is not configured. Set the Supabase environment variables.");
  const response = await fetch(`${supabaseUrl}/auth/v1/${path}`, {
    method: path === "user" ? "PUT" : "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) saveSession(null);
    const error = new Error(result.msg || result.message || result.error_description || result.error || "Authentication request failed.");
    error.status = response.status;
    throw error;
  }
  return result;
}

async function refreshSession(session) {
  if (!session?.refresh_token) return null;
  try {
    const next = await authRequest("token?grant_type=refresh_token", {
      refresh_token: session.refresh_token,
    });
    saveSession(next);
    return next;
  } catch (cause) {
    if (cause.status === 400 || cause.status === 401) {
      saveSession(null);
      return null;
    }
    throw cause;
  }
}

async function validSession() {
  let session = readSession();
  if (!session?.access_token) return null;
  const expiresAt = session.expires_at || 0;
  if (expiresAt && expiresAt * 1000 < Date.now() + 60_000) {
    session = await refreshSession(session);
  }
  return session;
}

async function restRequest(path, { method = "GET", body, headers = {}, publicRead = false } = {}) {
  const session = publicRead ? null : await validSession();
  if (!publicRead && !session?.access_token) throw new Error("Please log in and try again.");
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: supabaseAnonKey,
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json", Prefer: "return=representation" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) saveSession(null);
    throw new Error(result?.message || result?.details || result?.hint || "Database request failed.");
  }
  return result;
}

export async function signUp(email, password, fullName) {
  const result = await authRequest("signup", {
    email,
    password,
    data: { full_name: fullName },
  });
  if (result.access_token) saveSession(result);
  return result;
}

export async function resendSignupConfirmation(email) {
  return authRequest("resend", { type: "signup", email: email.trim() });
}

export async function requestPasswordReset(email) {
  const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
  return authRequest(
    `recover?redirect_to=${encodeURIComponent(redirectTo)}`,
    { email },
  );
}

export function restoreRecoverySessionFromUrl() {
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (fragment.get("type") !== "recovery" || !fragment.get("access_token")) return false;
  const expiresIn = Number(fragment.get("expires_in")) || 3600;
  saveSession({
    access_token: fragment.get("access_token"),
    refresh_token: fragment.get("refresh_token"),
    token_type: fragment.get("token_type") || "bearer",
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
  });
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  return true;
}

export async function signIn(email, password) {
  const result = await authRequest("token?grant_type=password", { email, password });
  saveSession(result);
  return result;
}

export async function signOut() {
  const session = await validSession();
  try {
    if (session?.access_token) {
      await authRequest("logout", {}, session.access_token);
    }
  } finally {
    saveSession(null);
  }
}

export async function getCurrentProfile() {
  const session = await validSession();
  if (!session?.access_token) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${session.access_token}` },
  });
  const authUser = await response.json().catch(() => ({}));
  if (!response.ok) {
    saveSession(null);
    if (response.status === 401) return null;
    throw new Error(authUser.message || "Could not restore your session.");
  }
  const profiles = await restRequest(
    `profiles?id=eq.${encodeURIComponent(authUser.id)}&select=id,full_name,role`,
  );
  const profile = profiles?.[0];
  if (!profile) throw new Error("Your account profile is missing. Contact support.");
  return {
    id: profile.id,
    name: profile.full_name,
    email: authUser.email,
    role: profile.role === "member" ? "user" : profile.role,
    organizerId: null,
  };
}

export async function changePassword(email, currentPassword, newPassword) {
  await signIn(email, currentPassword);
  const session = await validSession();
  if (!session?.access_token) throw new Error("Please log in and try again.");
  const result = await authRequest("user", { password: newPassword }, session.access_token);
  return result;
}

export async function setRecoveryPassword(password) {
  const session = await validSession();
  if (!session?.access_token) throw new Error("Your recovery link is invalid or expired. Request a new one.");
  return authRequest("user", { password }, session.access_token);
}

export async function listUsers() {
  return restRequest("profiles?select=id,full_name,role,created_at&order=created_at.desc");
}

export async function listHostApplications() {
  return restRequest("host_applications?status=eq.pending&select=*,profiles(full_name)&order=submitted_at.asc");
}

export async function getMyPendingHostApplication(userId) {
  const applications = await restRequest(
    `host_applications?user_id=eq.${encodeURIComponent(userId)}&status=eq.pending&select=id,submitted_at&limit=1`,
  );
  return applications?.[0] || null;
}

export async function submitHostApplication(application) {
  const pendingApplication = await getMyPendingHostApplication(application.user_id);
  if (pendingApplication) {
    throw new Error("You already have a host application awaiting review. You can submit events after an administrator approves it.");
  }
  try {
    return await restRequest("host_applications", { method: "POST", body: application });
  } catch (cause) {
    if (cause.message?.includes("one_pending_host_application_per_user")) {
      throw new Error("You already have a host application awaiting review. You can submit events after an administrator approves it.");
    }
    throw cause;
  }
}

export async function setAnotherUserPassword(userId, password) {
  const session = await validSession();
  if (!session?.access_token) throw new Error("Please log in and try again.");
  const response = await fetch(`${supabaseUrl}/functions/v1/admin-set-password`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ target_user_id: userId, new_password: password }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Could not update that user's password.");
  return result;
}

export async function listSavedEventIds() {
  return restRequest("saved_events?select=event_id");
}

export async function saveEvent(eventId) {
  return restRequest("saved_events", {
    method: "POST",
    body: { event_id: eventId },
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });
}

export async function unsaveEvent(eventId) {
  return restRequest(`saved_events?event_id=eq.${encodeURIComponent(eventId)}`, { method: "DELETE" });
}

export async function listFollowedOrganizerIds() {
  return restRequest("organizer_follows?select=organizer_id");
}

export async function followOrganizer(organizerId) {
  return restRequest("organizer_follows", {
    method: "POST",
    body: { organizer_id: organizerId },
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });
}

export async function unfollowOrganizer(organizerId) {
  return restRequest(`organizer_follows?organizer_id=eq.${encodeURIComponent(organizerId)}`, { method: "DELETE" });
}

export async function listMyAttendance() {
  return restRequest("event_attendance?select=event_id,status");
}

export async function setEventAttendance(eventId, userId, status) {
  return restRequest("event_attendance", {
    method: "POST",
    body: { event_id: eventId, user_id: userId, status },
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  });
}

export async function listEventAttendees(eventId) {
  return restRequest(
    `event_attendance?event_id=eq.${encodeURIComponent(eventId)}&status=neq.cancelled&select=user_id,status,created_at,profiles(full_name)&order=created_at.asc`,
  );
}

export async function listEventAdPayments() {
  return restRequest("event_ad_payments?select=*&order=confirmed_at.desc");
}

export async function recordEventAdPayment(payment) {
  return restRequest("event_ad_payments", { method: "POST", body: payment });
}

export async function voidEventAdPayment(paymentId, reason) {
  return restRequest("rpc/void_event_ad_payment", {
    method: "POST",
    body: { payment_id: paymentId, reason },
  });
}

async function listEventAdRankings(publicRead = false) {
  return restRequest("event_ad_rankings?select=event_id,sponsored_rank", { publicRead });
}

function withMetricsAndAdRankings(events, metrics, rankings) {
  const metricsByEvent = new Map(metrics.map((row) => [row.event_id, row]));
  const ranksByEvent = new Map(rankings.map((row) => [row.event_id, row.sponsored_rank]));
  return events.map((event) => ({
    ...event,
    metrics: metricsByEvent.get(event.id) || null,
    sponsored_rank: ranksByEvent.get(event.id) || null,
  }));
}

export async function markAttendeePresent(eventId, userId) {
  return restRequest(
    `event_attendance?event_id=eq.${encodeURIComponent(eventId)}&user_id=eq.${encodeURIComponent(userId)}`,
    { method: "PATCH", body: { status: "attended" } },
  );
}

export async function updateEvent(eventId, patch) {
  return restRequest(`events?id=eq.${encodeURIComponent(eventId)}`, { method: "PATCH", body: patch });
}

export async function deleteEvent(eventId) {
  return restRequest(`events?id=eq.${encodeURIComponent(eventId)}`, { method: "DELETE" });
}

export async function listApprovedEvents() {
  const [events, metrics, rankings] = await Promise.all([
    restRequest(
      "events?status=eq.approved&select=*,organizers(id,name,contact_email)&order=event_date.asc",
      { publicRead: true },
    ),
    restRequest("event_metrics?select=event_id,attendee_count,attendance_count,rating_count,average_rating", { publicRead: true }),
    listEventAdRankings(true),
  ]);
  return withMetricsAndAdRankings(events, metrics, rankings);
}

export async function listAdminEvents() {
  const [events, metrics, rankings] = await Promise.all([
    restRequest("events?select=*&order=event_date.asc"),
    restRequest("event_metrics?select=event_id,attendee_count,attendance_count,rating_count,average_rating"),
    listEventAdRankings(),
  ]);
  return withMetricsAndAdRankings(events, metrics, rankings);
}

export async function listPublicOrganizers() {
  return restRequest("organizers?select=id,owner_id,name,description,location,website,contact_email,contact_phone,logo_path", { publicRead: true });
}

export async function createEvent(event) {
  return restRequest("events", { method: "POST", body: event });
}

export async function uploadEventImage(file) {
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowedTypes.has(file.type)) throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image must be 5 MB or smaller.");
  const session = await validSession();
  if (!session?.access_token) throw new Error("Please log in and try again.");
  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `${session.user?.id || (await getCurrentProfile())?.id}/${crypto.randomUUID()}.${extension}`;
  const response = await fetch(`${supabaseUrl}/storage/v1/object/event-media/${path}`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": file.type,
      "x-upsert": "false",
    },
    body: file,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || "Could not upload the event image.");
  }
  return `${supabaseUrl}/storage/v1/object/public/event-media/${path}`;
}

export async function approveHostApplication(applicationId, approved, note = "") {
  return restRequest("rpc/approve_host_application", {
    method: "POST",
    body: { application_id: applicationId, approved, note },
  });
}

export async function submitEventRating(eventId, rating, review = "") {
  return restRequest("rpc/record_event_rating", {
    method: "POST",
    body: { target_event_id: eventId, score: rating, review_text: review },
  });
}
