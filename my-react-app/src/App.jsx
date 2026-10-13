import React, { useState, useMemo, useEffect } from "react";
import fallbackImage from "./assets/hero.png";
import {
  changePassword as changeAccountPassword, createEvent, deleteEvent,
  followOrganizer,   getCurrentProfile, getMyPendingHostApplication, isBackendConfigured, listAdminEvents, listApprovedEvents, listEventAdPayments,
  listEventAttendees, listFollowedOrganizerIds, listHostApplications, listMyAttendance, listPublicOrganizers,
  listSavedEventIds, listUsers, requestPasswordReset, resendSignupConfirmation, restoreRecoverySessionFromUrl,
  markAttendeePresent, saveEvent, setAnotherUserPassword, setRecoveryPassword, signIn, signOut, signUp,
  setEventAttendance, submitEventRating, submitHostApplication, unfollowOrganizer, uploadEventImage,
  unsaveEvent, updateEvent, approveHostApplication, recordEventAdPayment, voidEventAdPayment,
} from "./lib/supabase.js";
import {
  Search, MapPin, Menu, X, Heart, Share2, Calendar, Clock, Ticket,
  ChevronRight, ChevronLeft, Plus, User, LogOut, LayoutDashboard,
  CheckCircle2, XCircle, Star, Trash2, Pencil, Users, Building2, Filter,
  ArrowRight, Globe, Mail, Phone, Home, Compass, Bookmark, ChevronDown,
  Music, Mic2, Briefcase, Wrench, BookOpen, GraduationCap, Trophy, Palette,
  UtensilsCrossed, ShoppingBag, PartyPopper, Baby, HandHeart, Church, Cpu,
  HeartPulse, TrendingUp, Landmark, Gift, MoreHorizontal, Sparkles, Copy,
  MessageCircle, AtSign, Loader2, ShieldCheck,
  Flame, Link2
} from "lucide-react";

/* ============================================================================
   PLATFORM CONSTANTS AND DISPLAY HELPERS
   Live user and event data is loaded from Supabase below.
============================================================================ */

const CATEGORIES = [
  { slug: "music", name: "Music", icon: Music },
  { slug: "comedy", name: "Comedy", icon: Mic2 },
  { slug: "business", name: "Business", icon: Briefcase },
  { slug: "networking", name: "Networking", icon: Users },
  { slug: "workshops", name: "Workshops", icon: Wrench },
  { slug: "seminars", name: "Seminars", icon: BookOpen },
  { slug: "conferences", name: "Conferences", icon: Building2 },
  { slug: "education", name: "Education", icon: GraduationCap },
  { slug: "sports", name: "Sports", icon: Trophy },
  { slug: "arts-culture", name: "Arts & Culture", icon: Palette },
  { slug: "food-lifestyle", name: "Food & Lifestyle", icon: UtensilsCrossed },
  { slug: "markets", name: "Markets", icon: ShoppingBag },
  { slug: "festivals", name: "Festivals", icon: PartyPopper },
  { slug: "family", name: "Family", icon: Heart },
  { slug: "kids", name: "Kids", icon: Baby },
  { slug: "community", name: "Community", icon: HandHeart },
  { slug: "church-faith", name: "Church & Faith", icon: Church },
  { slug: "technology", name: "Technology", icon: Cpu },
  { slug: "health-wellness", name: "Health & Wellness", icon: HeartPulse },
  { slug: "career", name: "Career", icon: TrendingUp },
  { slug: "government", name: "Government", icon: Landmark },
  { slug: "charity", name: "Charity", icon: Gift },
  { slug: "online-events", name: "Online Events", icon: Globe },
  { slug: "other", name: "Other", icon: MoreHorizontal },
];
const catBySlug = (s) => CATEGORIES.find((c) => c.slug === s) || CATEGORIES[CATEGORIES.length - 1];

function eventFromRecord(event) {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description,
    imageSeed: event.image_path || slugify(event.title),
    categorySlug: event.category_slug,
    eventType: event.event_type,
    date: event.event_date,
    startTime: event.start_time?.slice(0, 5),
    endTime: event.end_time?.slice(0, 5),
    venue: event.venue || "Online",
    address: event.address || "",
    city: event.city,
    country: event.country,
    price: Number(event.price),
    ticketUrl: event.ticket_url || "",
    onlineUrl: event.online_url || "",
    contactInfo: event.contact_email || "",
    organizerId: event.organizer_id,
    status: event.status,
    featured: event.featured,
    sponsoredRank: event.sponsored_rank || null,
    createdAt: event.created_at?.slice(0, 10),
    rating: event.metrics?.average_rating ? Number(event.metrics.average_rating) : null,
    ratingCount: event.metrics?.rating_count || 0,
    attendeeCount: event.metrics?.attendee_count || 0,
    attendanceCount: event.metrics?.attendance_count || 0,
    goingUsers: [],
  };
}

function organizerFromRecord(organizer) {
  return {
    id: organizer.id,
    userId: organizer.owner_id,
    name: organizer.name,
    description: organizer.description,
    logoSeed: organizer.logo_path || slugify(organizer.name),
    location: organizer.location,
    website: organizer.website || "",
    instagram: "",
    facebook: "",
    x: "",
    email: organizer.contact_email,
    phone: organizer.contact_phone || "",
  };
}

const LOCATIONS = [
  "Mbabane", "Manzini", "Ezulwini", "Matsapha", "Malkerns", "Lobamba",
  "Nhlangano", "Siteki", "Big Bend", "Piggs Peak", "Other",
];

function slugify(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function routeFromLocation() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const currentPath = window.location.pathname;
  const appPath = basePath && (currentPath === basePath || currentPath.startsWith(`${basePath}/`))
    ? currentPath.slice(basePath.length) || "/"
    : currentPath;
  const path = appPath.replace(/\/+$/, "") || "/";
  const eventMatch = path.match(/^\/events\/([^/]+)$/);
  if (eventMatch) return { page: "event", params: { slug: decodeURIComponent(eventMatch[1]) } };
  const organizerMatch = path.match(/^\/organizers\/([^/]+)$/);
  if (organizerMatch) return { page: "organizer", params: { slug: decodeURIComponent(organizerMatch[1]) } };
  const pages = {
    "/": "home",
    "/events": "events",
    "/login": "login",
    "/signup": "signup",
    "/forgot-password": "forgot-password",
    "/profile": "profile",
    "/saved": "saved",
    "/submit": "submit",
    "/host": "host",
    "/admin": "admin",
  };
  return { page: pages[path] || "home", params: {} };
}
function routePath(page, params) {
  let path;
  if (page === "event" && params.slug) path = `/events/${encodeURIComponent(params.slug)}`;
  else if (page === "organizer" && params.slug) path = `/organizers/${encodeURIComponent(params.slug)}`;
  else {
    const paths = {
      home: "/",
      events: "/events",
      login: "/login",
      signup: "/signup",
      "forgot-password": "/forgot-password",
      profile: "/profile",
      saved: "/saved",
      submit: "/submit",
      host: "/host",
      admin: "/admin",
      "password-recovery": "/password-recovery",
    };
    path = paths[page] || "/";
  }
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`;
}
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
function addDays(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}
function nextWeekday(base, targetDow) {
  const d = new Date(base);
  const diff = (targetDow - d.getDay() + 7) % 7;
  return addDays(d, diff === 0 ? 0 : diff);
}

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const TODAY_STR = isoDate(TODAY);
const ESWATINI_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Mbabane",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const NEXT_FRI = nextWeekday(TODAY, 5);
const NEXT_SAT = addDays(NEXT_FRI, 1);
const NEXT_SUN = addDays(NEXT_FRI, 2);

/* ---------- Organizers ---------- */
const SEED_ORGANIZERS = import.meta.env.DEV ? [
  { id: "org-1", userId: "user-2", name: "Eswatini Live Entertainment", description: "Promoting the best live music, comedy and nightlife across Eswatini since 2016.", logoSeed: "org1", location: "Mbabane", website: "https://eswatinilive.example", instagram: "@eswatinilive", facebook: "eswatinilive", x: "@eswatinilive", email: "hello@eswatinilive.example", phone: "+268 7612 3456" },
  { id: "org-2", userId: null, name: "SwaziBiz Network", description: "A community of entrepreneurs, founders and professionals building Eswatini's business future.", logoSeed: "org2", location: "Manzini", website: "https://swazibiz.example", instagram: "@swazibiznetwork", facebook: "swazibiznetwork", x: "@swazibiz", email: "team@swazibiz.example", phone: "+268 7623 1122" },
  { id: "org-3", userId: null, name: "Ezulwini Arts Collective", description: "A collective of local artists, musicians and makers celebrating Eswatini's creative culture.", logoSeed: "org3", location: "Ezulwini", website: "https://ezulwiniarts.example", instagram: "@ezulwiniarts", facebook: "ezulwiniarts", x: "", email: "info@ezulwiniarts.example", phone: "+268 7699 8877" },
  { id: "org-4", userId: null, name: "TechHub Eswatini", description: "Growing the local tech ecosystem through workshops, bootcamps and career events.", logoSeed: "org4", location: "Mbabane", website: "https://techhub.example", instagram: "@techhubsz", facebook: "techhubeswatini", x: "@techhubsz", email: "team@techhub.example", phone: "+268 7654 3321" },
  { id: "org-5", userId: null, name: "House on Fire", description: "Eswatini's home for festivals, live performance and cross-border creative exchange.", logoSeed: "org5", location: "Malkerns", website: "https://houseonfire.example", instagram: "@houseonfiresz", facebook: "houseonfire", x: "@houseonfiresz", email: "bookings@houseonfire.example", phone: "+268 7611 0099" },
  { id: "org-6", userId: null, name: "Grace Fellowship Manzini", description: "A welcoming church community serving Manzini and surrounding areas.", logoSeed: "org6", location: "Manzini", website: "https://gracefellowship.example", instagram: "@gracefellowshipmzn", facebook: "gracefellowshipmanzini", x: "", email: "office@gracefellowship.example", phone: "+268 7688 4455" },
  { id: "org-7", userId: null, name: "Eswatini Sports Council", description: "Organising community sport, fun runs and wellness events nationwide.", logoSeed: "org7", location: "Mbabane", website: "https://swazisport.example", instagram: "@swazisport", facebook: "eswatinisportscouncil", x: "", email: "events@swazisport.example", phone: "+268 7645 6677" },
  { id: "org-8", userId: null, name: "Little Explorers Eswatini", description: "Fun, safe family and kids' events across the Ezulwini valley.", logoSeed: "org8", location: "Ezulwini", website: "", instagram: "@littleexplorerssz", facebook: "littleexplorerseswatini", x: "", email: "hello@littleexplorers.example", phone: "+268 7677 2211" },
  { id: "org-9", userId: null, name: "Green Hills Market Collective", description: "Farmers, makers and small businesses running Eswatini's favourite markets.", logoSeed: "org9", location: "Malkerns", website: "https://greenhillsmarket.example", instagram: "@greenhillsmarket", facebook: "greenhillsmarket", x: "", email: "market@greenhills.example", phone: "+268 7633 9900" },
] : [];

/* ---------- Events (raw seed, offsets resolved at load time) ---------- */
const RAW_EVENTS = import.meta.env.DEV ? [
  { title: "Mbabane Comedy Night", category: "comedy", organizerId: "org-1", city: "Mbabane", offset: 0, start: "19:00", end: "22:00", price: 150, featured: true, status: "approved", desc: "Eswatini's sharpest stand-up comedians take the stage for one riotous night of local and regional comedy. Expect crowd work, roasts, and a bar that stays open late.", venue: "The Waterford Hall" },
  { title: "Sunset Sessions Live", category: "music", organizerId: "org-5", city: "Malkerns", offset: 1, start: "17:00", end: "23:00", price: 250, featured: true, status: "approved", desc: "An open-air evening of live bands and DJs as the sun goes down over the Malkerns valley. Food trucks and craft drinks on site.", venue: "House on Fire Grounds" },
  { title: "SwaziBiz Founders Mixer", category: "networking", organizerId: "org-2", city: "Manzini", offset: 2, start: "18:00", end: "20:30", price: 0, featured: false, status: "approved", desc: "An informal evening for founders, freelancers and investors to meet, swap notes and find their next collaborator.", venue: "The Hub Co-working Space" },
  { title: "Intro to Digital Marketing Workshop", category: "workshops", organizerId: "org-4", city: "Mbabane", offset: 3, start: "09:00", end: "13:00", price: 300, featured: false, status: "approved", desc: "A hands-on half-day workshop covering social media, basic ads and content planning for small businesses.", venue: "TechHub Eswatini" },
  { title: "Manzini Craft & Farmers Market", category: "markets", organizerId: "org-9", cityOverride: "Manzini", useDate: NEXT_SAT, start: "08:00", end: "14:00", price: 0, featured: true, status: "approved", desc: "Fresh produce, handmade crafts, coffee and live acoustic music. A favourite Saturday morning tradition.", venue: "Manzini Market Square" },
  { title: "Ezulwini Valley Arts Walk", category: "arts-culture", organizerId: "org-3", cityOverride: "Ezulwini", useDate: NEXT_SUN, start: "10:00", end: "16:00", price: 0, featured: false, status: "approved", desc: "Self-guided walk through galleries, studios and pop-up exhibitions across the Ezulwini valley.", venue: "Ezulwini Craft Route" },
  { title: "House on Fire Festival Weekend", category: "festivals", organizerId: "org-5", cityOverride: "Malkerns", useDate: NEXT_FRI, start: "16:00", end: "23:59", price: 450, featured: true, status: "approved", desc: "Three stages, dozens of acts and a full weekend of music, theatre and street food to kick off the season.", venue: "House on Fire Grounds" },
  { title: "Little Explorers Family Fun Day", category: "kids", organizerId: "org-8", cityOverride: "Ezulwini", useDate: NEXT_SAT, start: "10:00", end: "15:00", price: 60, featured: false, status: "approved", desc: "Bouncy castles, face painting, a petting zoo and games for the whole family.", venue: "Ezulwini Sports Field" },
  { title: "Grace Fellowship Worship Gathering", category: "church-faith", organizerId: "org-6", cityOverride: "Manzini", useDate: NEXT_SUN, start: "09:00", end: "11:30", price: 0, featured: false, status: "approved", desc: "A special Sunday gathering open to the whole community, with worship, teaching and refreshments after.", venue: "Grace Fellowship Hall" },
  { title: "Eswatini Sports Council 5K Fun Run", category: "sports", organizerId: "org-7", city: "Mbabane", offset: 6, start: "06:30", end: "09:00", price: 50, featured: false, status: "approved", desc: "A community 5K for all fitness levels, with a kids' fun dash and prizes for top finishers.", venue: "Mbabane Sports Complex" },
  { title: "Career Growth Seminar: CV & Interview Skills", category: "career", organizerId: "org-4", city: "Mbabane", offset: 8, start: "14:00", end: "17:00", price: 0, featured: false, status: "approved", desc: "Practical guidance on building a standout CV and performing well in interviews, led by local HR professionals.", venue: "TechHub Eswatini" },
  { title: "National Health & Wellness Expo", category: "health-wellness", organizerId: "org-7", city: "Manzini", offset: 10, start: "09:00", end: "17:00", price: 0, featured: true, status: "approved", desc: "Free health screenings, fitness demos and wellness talks from clinics and practitioners across the country.", venue: "Manzini Trade Fair Grounds" },
  { title: "Startup Eswatini Pitch Conference", category: "conferences", organizerId: "org-2", city: "Mbabane", offset: 14, start: "08:30", end: "16:00", price: 500, featured: false, status: "approved", desc: "Founders pitch to a panel of investors, followed by workshops on fundraising and growth.", venue: "Mavuso Trade Centre" },
  { title: "Kids Coding Bootcamp", category: "education", organizerId: "org-4", city: "Matsapha", offset: 12, start: "09:00", end: "12:00", price: 200, featured: false, status: "approved", desc: "A playful introduction to coding and problem-solving for kids aged 8-14, no experience needed.", venue: "Matsapha Community Centre" },
  { title: "Malkerns Food & Lifestyle Fair", category: "food-lifestyle", organizerId: "org-9", city: "Malkerns", offset: 16, start: "11:00", end: "20:00", price: 0, featured: false, status: "approved", desc: "Local restaurants, home cooks and lifestyle brands showcase the best of Eswatini's food scene.", venue: "Malkerns Valley Grounds" },
  { title: "Community Clean-Up & Charity Drive", category: "charity", organizerId: "org-6", city: "Manzini", offset: 5, start: "08:00", end: "12:00", price: 0, featured: false, status: "approved", desc: "Join neighbours for a morning of cleaning up public spaces, followed by a donation drive for local shelters.", venue: "Manzini City Centre" },
  { title: "Digital Services Info Session", category: "government", organizerId: "org-4", city: "Mbabane", offset: 20, start: "10:00", end: "13:00", price: 0, featured: false, status: "approved", desc: "Learn how to access government services online, with staff on hand to help with registrations.", venue: "Mbabane Civic Centre" },
  { title: "Webinar: Grant Writing for NGOs", category: "online-events", organizerId: "org-2", city: "Online", offset: 7, start: "15:00", end: "16:30", price: 0, featured: false, status: "approved", desc: "A practical online session on writing winning grant applications, open to NGOs across the region.", venue: "Online", online: true, onlineUrl: "https://meet.example.com/grant-writing" },
  { title: "Matsapha Tech & Innovation Summit", category: "technology", organizerId: "org-4", city: "Matsapha", offset: 25, start: "09:00", end: "17:00", price: 350, featured: true, status: "approved", desc: "Regional tech leaders share insights on innovation, startups and digital transformation.", venue: "Matsapha Industrial Hall" },
  { title: "Church & Faith Worship Night", category: "church-faith", organizerId: "org-6", city: "Manzini", offset: 9, start: "18:00", end: "21:00", price: 0, featured: false, status: "approved", desc: "An evening of worship, music and reflection open to all denominations.", venue: "Grace Fellowship Hall" },
  { title: "Ezulwini Jazz & Wine Evening", category: "music", organizerId: "org-3", city: "Ezulwini", offset: 18, start: "18:00", end: "22:00", price: 300, featured: false, status: "approved", desc: "A relaxed evening of live jazz paired with local and imported wines overlooking the valley.", venue: "Ezulwini Valley Lodge" },
  { title: "Standup Sensations: Comedy Tour", category: "comedy", organizerId: "org-1", city: "Manzini", offset: 22, start: "19:30", end: "22:00", price: 200, featured: false, status: "approved", desc: "The regional comedy tour lands in Manzini for one night only, featuring four headline acts.", venue: "Manzini Theatre Club" },
  { title: "Big Bend Agricultural Show", category: "community", organizerId: "org-9", city: "Big Bend", offset: 30, start: "08:00", end: "17:00", price: 20, featured: false, status: "approved", desc: "Livestock, produce and machinery displays alongside food stalls and live entertainment.", venue: "Big Bend Show Grounds" },
  { title: "Piggs Peak Adventure & Nature Fest", category: "community", organizerId: "org-7", city: "Piggs Peak", offset: 40, start: "07:00", end: "18:00", price: 100, featured: false, status: "approved", desc: "Hiking trails, zipline demos and nature talks celebrating Eswatini's northern highlands.", venue: "Piggs Peak Forest Reserve" },
  { title: "Nhlangano Business Networking Breakfast", category: "networking", organizerId: "org-2", city: "Nhlangano", offset: 15, start: "07:00", end: "09:00", price: 0, featured: false, status: "pending", desc: "A monthly breakfast meetup for business owners in the southern region.", venue: "Nhlangano Hotel" },
  { title: "Siteki Cultural Heritage Day", category: "arts-culture", organizerId: "org-3", city: "Siteki", offset: 28, start: "09:00", end: "16:00", price: 0, featured: false, status: "pending", desc: "A celebration of Eswatini's cultural heritage through dance, craft and storytelling.", venue: "Siteki Community Grounds" },
  { title: "Unlicensed Warehouse Party", category: "music", organizerId: "org-1", city: "Mbabane", offset: 3, start: "20:00", end: "23:59", price: 100, featured: false, status: "rejected", desc: "Submitted without complete venue and safety information.", venue: "TBA" },
  { title: "Manzini Business Expo", category: "business", organizerId: "org-2", city: "Manzini", offset: -12, start: "09:00", end: "17:00", price: 0, featured: false, status: "approved", desc: "An expo connecting local businesses with new customers and partners.", venue: "Manzini Trade Fair Grounds" },
  { title: "Throwback Comedy Show", category: "comedy", organizerId: "org-1", city: "Mbabane", offset: -5, start: "19:00", end: "22:00", price: 120, featured: false, status: "approved", desc: "A now-concluded evening of stand-up comedy.", venue: "The Waterford Hall" },
] : [];

function resolveEventDate(raw) {
  if (raw.useDate) return isoDate(raw.useDate);
  return isoDate(addDays(TODAY, raw.offset));
}

const SEED_EVENTS = RAW_EVENTS.map((raw, i) => {
  const organizer = SEED_ORGANIZERS.find((o) => o.id === raw.organizerId);
  const date = resolveEventDate(raw);
  return {
    id: "evt-" + (i + 1),
    slug: slugify(raw.title) + "-" + (i + 1),
    title: raw.title,
    description: raw.desc,
    imageSeed: slugify(raw.title),
    categorySlug: raw.category,
    eventType: raw.online ? "online" : "in-person",
    date,
    startTime: raw.start,
    endTime: raw.end,
    venue: raw.venue,
    address: raw.venue + ", " + (raw.cityOverride || raw.city),
    city: raw.cityOverride || raw.city,
    country: "Eswatini",
    price: raw.price,
    ticketUrl: raw.price > 0 ? "https://tickets.example.com/" + slugify(raw.title) : "",
    onlineUrl: raw.onlineUrl || "",
    contactInfo: organizer ? organizer.email : "",
    organizerId: raw.organizerId,
    status: raw.status,
    featured: raw.featured,
    createdAt: isoDate(addDays(TODAY, -30 + i)),
    rating: null,
    attendeeCount: 0,
    goingUsers: [],
  };
});

/* ============================================================================
   HELPERS
============================================================================ */
function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function formatDateShort(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}
function priceLabel(price) {
  return price === 0 ? "Free" : `E${price}`;
}
function getEffectiveStatus(evt) {
  if (evt.status === "approved" && evt.date < TODAY_STR) return "expired";
  return evt.status;
}
function isUpcomingApproved(evt) {
  return evt.status === "approved" && evt.date >= TODAY_STR;
}
function eswatiniDateTimeNow() {
  const parts = ESWATINI_DATE_TIME_FORMATTER.formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
}
function eventStartIsFuture(evt, now = eswatiniDateTimeNow()) {
  return `${evt.date}T${evt.startTime}:00` > now;
}
function isPromotionActive(evt) {
  return Boolean(evt.sponsoredRank && eventStartIsFuture(evt));
}
function eventPromotionOrder(a, b) {
  const now = eswatiniDateTimeNow();
  const rank = (event) => event.sponsoredRank && eventStartIsFuture(event, now)
    ? event.sponsoredRank
    : Number.MAX_SAFE_INTEGER;
  return rank(a) - rank(b) ||
    Number(b.featured) - Number(a.featured) ||
    a.date.localeCompare(b.date) ||
    a.startTime.localeCompare(b.startTime);
}
function imgUrl(seed) {
  if (typeof seed === "string" && /^https:\/\//i.test(seed)) return seed;
  return fallbackImage;
}
function isThisWeekend(dateStr) {
  return dateStr === isoDate(NEXT_FRI) || dateStr === isoDate(NEXT_SAT) || dateStr === isoDate(NEXT_SUN);
}
function isThisWeek(dateStr) {
  return dateStr >= TODAY_STR && dateStr <= isoDate(addDays(TODAY, 7));
}
function isThisMonth(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.getMonth() === TODAY.getMonth() && d.getFullYear() === TODAY.getFullYear();
}
function daysFromToday(n) {
  return isoDate(addDays(TODAY, n));
}

/* ============================================================================
   SMALL UI PRIMITIVES
============================================================================ */
function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-slate-900 dark:bg-slate-800 text-white text-sm font-medium px-5 py-3 rounded-full shadow-xl flex items-center gap-2 animate-slideInDown transition-all duration-300">
      <Sparkles size={15} className="text-amber-400" />
      {message}
    </div>
  );
}

function Notch({ bg }) {
  return (
    <>
      <div className={`absolute -left-2.5 top-[152px] w-5 h-5 rounded-full ${bg} z-10`} />
      <div className={`absolute -right-2.5 top-[152px] w-5 h-5 rounded-full ${bg} z-10`} />
    </>
  );
}

function FeaturedTag() {
  return (
    <div className="absolute top-3 left-3 z-20 flex items-center gap-1 bg-gradient-to-r from-amber-400 to-rose-500 text-white text-[11px] font-bold tracking-wide px-2.5 py-1 rounded-full shadow-md font-display">
      <Flame size={12} /> FEATURED
    </div>
  );
}

function SponsoredTag({ rank }) {
  return (
    <div className="absolute top-3 left-3 z-20 flex items-center gap-1 bg-indigo-950 text-white text-[11px] font-bold tracking-wide px-2.5 py-1 rounded-full shadow-md font-display">
      <Sparkles size={12} /> SPONSORED{rank === 1 ? "" : ` #${rank}`}
    </div>
  );
}

function SaveHeart({ saved, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label={saved ? "Remove from saved events" : "Save event"}
      className={`absolute top-3 right-3 z-20 w-9 h-9 rounded-full flex items-center justify-center shadow-md transition ${
        saved ? "bg-rose-500 text-white" : "bg-white/90 text-slate-700 hover:bg-white"
      }`}
    >
      <Heart size={16} fill={saved ? "currentColor" : "none"} />
    </button>
  );
}

function EventRatingForm({ event, onSubmit }) {
  const [rating, setRating] = useState("5");
  const [review, setReview] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form onSubmit={async (submitEvent) => {
      submitEvent.preventDefault();
      setBusy(true);
      setError("");
      setMessage("");
      try {
        await onSubmit(event.id, Number(rating), review);
        setMessage("Thanks — your rating has been saved.");
      } catch (cause) {
        setError(cause.message || "Could not save your rating.");
      } finally {
        setBusy(false);
      }
    }} className="border border-stone-200 rounded-2xl p-5 mt-6">
      <h2 className="font-display font-bold text-slate-900 mb-3">Rate this event</h2>
      <label className="text-xs font-semibold text-slate-600 block mb-1.5">Rating</label>
      <select value={rating} onChange={(event) => setRating(event.target.value)} className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm mb-3">
        {[5, 4, 3, 2, 1].map((score) => <option key={score} value={score}>{score} {score === 1 ? "star" : "stars"}</option>)}
      </select>
      <label className="text-xs font-semibold text-slate-600 block mb-1.5">Review (optional)</label>
      <textarea value={review} onChange={(event) => setReview(event.target.value)} maxLength={2000} rows={3} className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm mb-3" />
      {error && <p role="alert" className="text-sm text-rose-600 mb-2">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700 mb-2">{message}</p>}
      <button disabled={busy} className="bg-slate-900 text-white font-semibold px-4 py-2 rounded-full disabled:opacity-60">{busy ? "Saving..." : "Save rating"}</button>
    </form>
  );
}

function EventCard({ event, sectionBg = "bg-stone-50", saved, onToggleSave, onOpen, organizer }) {
  const cat = catBySlug(event.categorySlug);
  const Icon = cat.icon;
  const rating = event.rating;
  const attendeeCount = event.attendeeCount || 0;
  return (
    <div className="w-full">
      <div
        className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-sm hover:shadow-2xl transition-all duration-300 cursor-pointer overflow-hidden border border-stone-100 dark:border-slate-700 group transform hover:scale-105 hover:-translate-y-2"
        onClick={() => onOpen(event)}
      >
        <div className="relative h-40 w-full overflow-hidden">
          <img src={imgUrl(event.imageSeed)} alt={event.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
          {isPromotionActive(event) ? <SponsoredTag rank={event.sponsoredRank} /> : event.featured && <FeaturedTag />}
          <SaveHeart saved={saved} onClick={(e) => { e.stopPropagation(); onToggleSave(event); }} />
        </div>
        <div className="relative border-t border-dashed border-stone-200 dark:border-slate-700">
          <Notch bg={sectionBg} />
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wide font-mono">
              <Icon size={12} /> {cat.name}
            </div>
            {rating && event.ratingCount > 0 && (
              <div className="flex items-center gap-1 text-yellow-500 text-xs font-bold">
                ⭐ {rating.toFixed(1)} ({event.ratingCount})
              </div>
            )}
          </div>
          <h3 className="font-display font-bold text-slate-900 dark:text-white text-[15px] leading-snug mb-2 line-clamp-2 transition-colors duration-300 group-hover:text-violet-600 dark:group-hover:text-violet-400">{event.title}</h3>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-1">
            <Calendar size={13} /> {formatDateShort(event.date)} &middot; {formatTime(event.startTime)}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-3">
            <MapPin size={13} /> {event.city}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold font-mono transition-colors duration-300 ${event.price === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-white"}`}>
                {priceLabel(event.price)}
              </span>
              {attendeeCount > 0 && (
                <span className="text-[11px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full transition-all duration-300 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50">
                  👥 {attendeeCount}
                </span>
              )}
            </div>
            {organizer && <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-[80px] transition-colors duration-300 group-hover:text-slate-600 dark:group-hover:text-slate-400">{organizer.name}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryCard({ cat, onClick }) {
  const Icon = cat.icon;
  return (
    <button
      onClick={onClick}
      className="shrink-0 w-[104px] md:w-[124px] flex flex-col items-center gap-2 group cursor-pointer transition-all duration-300"
    >
      <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-indigo-950 to-violet-800 flex items-center justify-center text-amber-300 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-violet-600/50 transition-all duration-300 shadow-md">
        <Icon size={26} />
      </div>
      <span className="text-xs font-semibold text-slate-700 text-center leading-tight transition-all duration-300 group-hover:text-violet-700 group-hover:font-bold">{cat.name}</span>
    </button>
  );
}

function SectionHeader({ eyebrow, title, action, onAction }) {
  return (
    <div className="flex items-end justify-between mb-5">
      <div>
        {eyebrow && <div className="text-[11px] font-mono font-semibold text-rose-500 uppercase tracking-widest mb-1">{eyebrow}</div>}
        <h2 className="font-display text-2xl md:text-3xl font-extrabold text-slate-900">{title}</h2>
      </div>
      {action && (
        <button onClick={onAction} className="hidden sm:flex items-center gap-1 text-sm font-semibold text-violet-700 hover:text-violet-900 whitespace-nowrap">
          {action} <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}

function HRow({ children }) {
  return <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">{children}</div>;
}

function EmptyState({ icon: Icon = Search, title, sub }) {
  return (
    <div className="text-center py-16 px-4">
      <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto mb-4 text-slate-400">
        <Icon size={24} />
      </div>
      <p className="font-display font-bold text-slate-800 mb-1">{title}</p>
      {sub && <p className="text-sm text-slate-500">{sub}</p>}
    </div>
  );
}

/* ============================================================================
   NAV
============================================================================ */
function Navbar({ nav, currentUser, onLogout, search, setSearch, onSearchSubmit, darkMode, setDarkMode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-stone-200 dark:border-slate-800 transition-colors duration-300 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center gap-4">
        <button onClick={() => nav("home")} className="font-display text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white shrink-0 transition-colors duration-300 hover:scale-105 transform">
          SHOW<span className="text-rose-500">UP</span>
        </button>

        <div className="hidden md:flex items-center flex-1 max-w-md bg-gray-100 dark:bg-slate-800 rounded-full px-4 h-10 gap-2 transition-colors duration-300">
          <Search size={16} className="text-slate-500 dark:text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearchSubmit()}
            placeholder="Search events, venues, categories..."
            className="bg-transparent text-sm outline-none w-full placeholder:text-slate-500 dark:placeholder:text-slate-400 dark:text-white transition-colors duration-300"
          />
        </div>

        <nav className="hidden md:flex items-center gap-6 ml-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
          <button onClick={() => nav("events")} className="hover:text-slate-900 dark:hover:text-white transition-colors duration-200">Explore</button>
          <button onClick={() => nav("submit")} className="hover:text-slate-900 dark:hover:text-white transition-colors duration-200">Submit Event</button>
        </nav>

        <div className="hidden md:flex items-center gap-3 ml-auto">
          {currentUser ? (
            <>
              <button onClick={() => nav("saved")} className="text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors duration-200">Saved</button>
              {currentUser.role === "admin" && (
                <button onClick={() => nav("admin")} className="text-sm font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors duration-200">⚙️ Admin</button>
              )}
              <button onClick={() => nav("profile")} className="w-9 h-9 rounded-full bg-rose-500 dark:bg-rose-600 text-white flex items-center justify-center font-bold text-sm hover:bg-rose-600 dark:hover:bg-rose-700 transition-colors">
                {currentUser.name.charAt(0)}
              </button>
              <button onClick={onLogout} title="Log out" className="text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors duration-200">
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => nav("login")} className="text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors duration-200">Log in</button>
              <button onClick={() => nav("signup")} className="text-sm font-semibold bg-rose-600 dark:bg-rose-700 text-white px-4 py-2 rounded-full hover:bg-rose-700 dark:hover:bg-rose-800 transition-colors duration-200">Sign up</button>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 ml-auto md:ml-0">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors duration-200 transform hover:scale-110"
            title="Toggle dark mode"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button className="md:hidden text-slate-700 dark:text-slate-300 transition-colors duration-200" onClick={() => setMenuOpen(true)}>
            <Menu size={24} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950 md:hidden flex flex-col" onClick={() => setMenuOpen(false)}>
          {/* Header */}
          <div className="p-6 flex justify-between items-center border-b border-slate-800 bg-slate-900">
            <h2 className="text-3xl font-bold text-white font-display">SHOW<span className="text-rose-500">UP</span></h2>
            <button onClick={() => setMenuOpen(false)} className="text-white hover:text-rose-400 transform hover:scale-110 transition-all p-2">
              <X size={32} />
            </button>
          </div>
          
          {/* Menu Content - Non-scrolling */}
          <div className="flex-1 flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
              {/* Main Navigation */}
              {[
                ["🏠 Home", "home", Home], 
                ["🔍 Explore Events", "events", Compass], 
                ["➕ Submit Event", "submit", Plus], 
                ["📑 Saved Events", "saved", Bookmark],
              ].map(([label, page, Icon]) => (
                <button 
                  key={page} 
                  onClick={() => { nav(page); setMenuOpen(false); }} 
                  className="w-full text-left px-6 py-4 text-2xl font-bold text-white hover:bg-slate-800/60 active:bg-rose-600/40 flex items-center gap-4 rounded-xl transition-all duration-200"
                >
                  <Icon size={32} className="flex-shrink-0 text-rose-400" />
                  <span>{label}</span>
                </button>
              ))}

              {currentUser?.role === "admin" && (
                <>
                  <div className="border-t border-slate-700 my-4" />
                  <button 
                    onClick={() => { nav("admin"); setMenuOpen(false); }} 
                    className="w-full text-left px-6 py-4 text-2xl font-bold text-amber-400 hover:bg-amber-900/30 active:bg-amber-600/40 flex items-center gap-4 rounded-xl transition-all duration-200"
                  >
                    <LayoutDashboard size={32} className="flex-shrink-0" /> ⚙️ Admin Panel
                  </button>
                </>
              )}
            </div>

            {/* Footer Section - Dark Mode Toggle & Auth */}
            <div className="border-t border-slate-800 px-4 py-6 space-y-3">
              {/* Dark Mode Toggle */}
              <button 
                onClick={() => setDarkMode(!darkMode)}
                className="w-full flex items-center gap-4 px-6 py-3 text-xl font-semibold text-white hover:bg-slate-800/60 rounded-xl transition-all"
              >
                <span className="text-2xl">{darkMode ? '☀️' : '🌙'}</span>
                <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
              </button>

              {/* Account Section */}
              {currentUser ? (
                <>
                  <div className="border-t border-slate-700 pt-3" />
                  <button 
                    onClick={() => { nav("profile"); setMenuOpen(false); }} 
                    className="w-full text-left px-6 py-4 text-xl font-bold text-white hover:bg-slate-800/60 active:bg-blue-600/40 flex items-center gap-4 rounded-xl transition-all"
                  >
                    <User size={28} className="flex-shrink-0 text-blue-400" /> 
                    My Profile
                  </button>
                  <button 
                    onClick={() => { onLogout(); setMenuOpen(false); }} 
                    className="w-full text-left px-6 py-4 text-xl font-bold text-red-400 hover:bg-red-900/30 active:bg-red-600/40 flex items-center gap-4 rounded-xl transition-all"
                  >
                    <LogOut size={28} className="flex-shrink-0" /> 
                    Log Out
                  </button>
                </>
              ) : (
                <>
                  <div className="border-t border-slate-700 pt-3" />
                  <button 
                    onClick={() => { nav("login"); setMenuOpen(false); }} 
                    className="w-full px-6 py-4 text-xl font-bold text-white bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-xl transition-all"
                  >
                    🔑 Log In
                  </button>
                  <button 
                    onClick={() => { nav("signup"); setMenuOpen(false); }} 
                    className="w-full px-6 py-4 text-xl font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl transition-all"
                  >
                    ✨ Create Account
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function MobileNav({ page, nav }) {
  const items = [
    ["home", "Home", Home], ["events", "Explore", Compass], ["saved", "Saved", Bookmark], ["profile", "Profile", User],
  ];
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-800 border-t border-stone-200 dark:border-slate-700 flex items-stretch h-16 pb-[env(safe-area-inset-bottom)] transition-colors duration-300">
      {items.map(([p, label, Icon]) => (
        <button key={p} onClick={() => nav(p)} className={`flex-1 flex flex-col items-center justify-center gap-1 ${page === p ? "text-rose-500" : "text-slate-400"}`}>
          <Icon size={20} fill={page === p ? "currentColor" : "none"} strokeWidth={page === p ? 1.5 : 2} />
          <span className="text-[10px] font-semibold">{label}</span>
        </button>
      ))}
    </div>
  );
}

function Footer({ nav }) {
  return (
    <footer className="bg-indigo-950 text-indigo-200 mt-16">
      <div className="max-w-7xl mx-auto px-6 py-12 grid md:grid-cols-4 gap-8">
        <div>
          <div className="font-display text-2xl font-extrabold text-white mb-2">SHOW<span className="text-rose-400">UP</span></div>
          <p className="text-sm text-indigo-300 max-w-xs">Discover what's happening. Show up. Eswatini's home for events — free, always.</p>
        </div>
        <div>
          <div className="text-xs font-mono uppercase tracking-widest text-indigo-400 mb-3">Discover</div>
          <div className="flex flex-col gap-2 text-sm">
            <button onClick={() => nav("events")} className="text-left hover:text-white">All events</button>
            <button onClick={() => nav("events", { free: true })} className="text-left hover:text-white">Free events</button>
            <button onClick={() => nav("events", { when: "weekend" })} className="text-left hover:text-white">This weekend</button>
          </div>
        </div>
        <div>
          <div className="text-xs font-mono uppercase tracking-widest text-indigo-400 mb-3">Organizers</div>
          <div className="flex flex-col gap-2 text-sm">
            <button onClick={() => nav("submit")} className="text-left hover:text-white">Submit an event</button>
            <button onClick={() => nav("signup")} className="text-left hover:text-white">Create an account</button>
          </div>
        </div>
        <div>
          <div className="text-xs font-mono uppercase tracking-widest text-indigo-400 mb-3">Company</div>
          <div className="flex flex-col gap-2 text-sm text-indigo-300">
            <span>Mbabane, Eswatini</span>
            <span>hello@showup.sz</span>
          </div>
        </div>
      </div>
      <div className="border-t border-indigo-900 py-5 text-center text-xs text-indigo-400">
        &copy; {new Date().getFullYear()} SHOW UP. Built for Eswatini, made to grow.
      </div>
    </footer>
  );
}

/* ============================================================================
   PAGES
============================================================================ */
function EventCarousel({ events, nav, openEvent, savedIds, toggleSave, organizers }) {
  const [current, setCurrent] = useState(0);
  
  useEffect(() => {
    if (events.length === 0) return;
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % events.length);
    }, 6000); // Auto-slide every 6 seconds
    return () => clearInterval(interval);
  }, [events.length]);

  const handlePrev = () => {
    setCurrent((prev) => (prev - 1 + events.length) % events.length);
  };

  const handleNext = () => {
    setCurrent((prev) => (prev + 1) % events.length);
  };
  
  return (
    <section className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 py-12 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-xs font-mono font-bold text-rose-400 uppercase tracking-widest mb-2">⭐ Featured</div>
            <h2 className="font-display text-4xl md:text-5xl font-extrabold text-white">Premium Events</h2>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={handlePrev}
              className="p-3 rounded-full bg-white/10 hover:bg-rose-600/30 text-white transition-all duration-300 transform hover:scale-110"
              title="Previous event"
            >
              <ChevronLeft size={28} />
            </button>
            <button 
              onClick={handleNext}
              className="p-3 rounded-full bg-white/10 hover:bg-rose-600/30 text-white transition-all duration-300 transform hover:scale-110"
              title="Next event"
            >
              <ChevronRight size={28} />
            </button>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 shadow-2xl min-h-[500px] md:min-h-96">
          {events.map((e, i) => {
            const org = organizers.find(o => o.id === e.organizerId);
            const isVisible = i === current;
            const isPrev = i === (current - 1 + events.length) % events.length;
            return (
              <div 
                key={e.id} 
                className={`absolute inset-0 transition-all duration-700 ease-in-out ${
                  isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
                }`}
              >
                {/* Background Image Overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent" />
                
                <div className="h-full grid md:grid-cols-2 gap-8 items-center p-8 md:p-16">
                  {/* Event Details */}
                  <div className="text-white space-y-6 z-10">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-rose-500/20 to-purple-500/20 border border-rose-400/50 rounded-full">
                      <span className="text-xs font-bold uppercase tracking-widest text-rose-300">Featured Event</span>
                    </div>

                    {/* Title */}
                    <div>
                      <h3 className="font-display text-4xl md:text-5xl font-extrabold text-white mb-3 leading-tight">{e.title}</h3>
                      {org && (
                        <p className="text-lg text-indigo-200 font-semibold">by {org.name}</p>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-indigo-100 text-lg leading-relaxed">{e.description?.substring(0, 180)}...</p>

                    {/* Event Details Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/10">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                          <Calendar size={18} className="text-rose-300" />
                        </div>
                        <div>
                          <p className="text-xs text-indigo-300">Date & Time</p>
                          <p className="font-semibold">{formatDate(e.date)} • {formatTime(e.startTime)}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                          <MapPin size={18} className="text-rose-300" />
                        </div>
                        <div>
                          <p className="text-xs text-indigo-300">Location</p>
                          <p className="font-semibold">{e.venue || e.city}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                          <Ticket size={18} className="text-rose-300" />
                        </div>
                        <div>
                          <p className="text-xs text-indigo-300">Price</p>
                          <p className="font-semibold text-lg">{e.price === 0 ? "FREE" : `SZL ${e.price}`}</p>
                        </div>
                      </div>

                      {e.attendeeCount > 0 && (
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                            <Users size={18} className="text-rose-300" />
                          </div>
                          <div>
                            <p className="text-xs text-indigo-300">Attendees</p>
                            <p className="font-semibold">{e.attendeeCount} people going</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-4 pt-6">
                      <button 
                        onClick={() => openEvent(e)}
                        className="flex-1 px-6 py-3 bg-white text-indigo-600 font-bold rounded-xl hover:bg-rose-50 active:scale-95 transition-all duration-200 transform hover:shadow-lg"
                      >
                        Learn More
                      </button>
                      <button
                        onClick={() => toggleSave(e)}
                        className={`px-6 py-3 rounded-xl font-bold transition-all duration-200 flex items-center gap-2 transform hover:scale-105 ${
                          savedIds.has(e.id) 
                            ? 'bg-rose-500 text-white hover:bg-rose-600' 
                            : 'bg-white/20 text-white hover:bg-white/30'
                        }`}
                      >
                        <Heart size={20} fill={savedIds.has(e.id) ? "currentColor" : "none"} />
                      </button>
                    </div>
                  </div>

                  {/* Right Side - Image/Visual */}
                  <div className="hidden md:flex items-center justify-center">
                    <div className="relative w-full max-w-96 aspect-square group">
                      <img 
                        src={imgUrl(e.imageSeed, 400, 400)}
                        alt={e.title}
                        className="w-full h-full object-cover rounded-2xl shadow-2xl transition-transform duration-700 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      
                      {/* Rating Badge */}
                      {e.rating && (
                        <div className="absolute top-4 right-4 bg-yellow-400 text-slate-900 px-4 py-2 rounded-full font-bold shadow-lg">
                          ⭐ {e.rating.toFixed(1)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dot Navigation */}
        <div className="flex items-center justify-center gap-3 mt-8">
          {events.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`transition-all duration-300 rounded-full ${
                i === current 
                  ? 'w-8 h-3 bg-rose-500 shadow-lg shadow-rose-500/50' 
                  : 'w-2 h-2 bg-white/40 hover:bg-white/70'
              }`}
              title={`Go to event ${i + 1}`}
            />
          ))}
        </div>

        {/* Auto-play Indicator */}
        <p className="text-center text-xs text-indigo-300 mt-6 font-mono">Auto-sliding every 6 seconds</p>
      </div>
    </section>
  );
}

function Hero({ nav, search, setSearch, location, setLocation }) {
  const [localSearch, setLocalSearch] = useState(search);
  return (
    <section className="relative bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-900 overflow-hidden">
      <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-rose-500/30 blur-3xl" />
      <div className="absolute -bottom-32 -left-16 w-96 h-96 rounded-full bg-amber-400/20 blur-3xl" />
      <div className="relative max-w-4xl mx-auto px-6 pt-20 pb-24 md:pt-28 md:pb-32 text-center">
        <div className="inline-flex items-center gap-1.5 bg-white/10 text-amber-200 text-xs font-mono font-semibold tracking-widest uppercase px-3 py-1.5 rounded-full mb-6">
          <MapPin size={12} /> Now live in Eswatini
        </div>
        <h1 className="font-display text-5xl md:text-7xl font-extrabold text-white leading-[0.98] tracking-tight mb-4">
          Discover what's<br />happening.
        </h1>
        <p className="text-indigo-200 text-base md:text-lg mb-9 max-w-lg mx-auto">
          Music, markets, comedy, conferences and everything in between. Find it, save it, show up.
        </p>

        <div className="bg-white rounded-2xl md:rounded-full p-2 flex flex-col md:flex-row gap-2 shadow-2xl max-w-2xl mx-auto">
          <div className="flex items-center gap-2 px-4 h-12 flex-1">
            <Search size={18} className="text-slate-400 shrink-0" />
            <input
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (setSearch(localSearch), nav("events"))}
              placeholder="Search events, venues, categories..."
              className="outline-none text-sm w-full text-slate-800 placeholder:text-slate-400"
            />
          </div>
          <div className="hidden md:flex items-center gap-1.5 px-4 h-12 border-t md:border-t-0 md:border-l border-stone-200 text-sm font-semibold text-slate-700">
            <MapPin size={16} className="text-rose-500" />
            <select value={location} onChange={(e) => setLocation(e.target.value)} className="bg-transparent outline-none">
              <option>Eswatini</option>
              {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <button
            onClick={() => { setSearch(localSearch); nav("events"); }}
            className="h-12 px-6 rounded-full md:rounded-full bg-rose-500 hover:bg-rose-600 text-white font-bold text-sm transition"
          >
            Search
          </button>
        </div>

        <div className="flex items-center justify-center gap-3 mt-8">
          <button onClick={() => nav("events")} className="bg-white text-indigo-950 font-bold text-sm px-6 py-3 rounded-full hover:bg-indigo-50 transition">
            Explore Events
          </button>
          <button onClick={() => nav("submit")} className="border border-white/30 text-white font-bold text-sm px-6 py-3 rounded-full hover:bg-white/10 transition">
            Submit an Event
          </button>
        </div>
      </div>
    </section>
  );
}

function HomePage({ nav, events, organizers, savedIds, toggleSave, openEvent, search, setSearch, location, setLocation }) {
  const approved = events.filter(isUpcomingApproved).sort(eventPromotionOrder);
  const trending = approved.slice(0, 8);
  const weekend = approved.filter((e) => isThisWeekend(e.date));
  const featured = approved.filter((e) => e.featured);
  const free = approved.filter((e) => e.price === 0).slice(0, 8);
  const orgById = (id) => organizers.find((o) => o.id === id);

  return (
    <div>
      <Hero nav={nav} search={search} setSearch={setSearch} location={location} setLocation={setLocation} />

      {/* Premium Event Carousel */}
      {featured.length > 0 && (
        <EventCarousel events={featured.slice(0, 5)} nav={nav} openEvent={openEvent} savedIds={savedIds} toggleSave={toggleSave} organizers={organizers} />
      )}

      <section className="max-w-7xl mx-auto px-4 md:px-6 py-14">
        <SectionHeader eyebrow="Don't miss out" title="Trending events" action="See all" onAction={() => nav("events")} />
        <HRow>
          {trending.map((e) => (
            <div key={e.id} className="w-[260px] shrink-0">
              <EventCard event={e} sectionBg="bg-white" saved={savedIds.has(e.id)} onToggleSave={toggleSave} onOpen={openEvent} organizer={orgById(e.organizerId)} />
            </div>
          ))}
        </HRow>
      </section>

      {weekend.length > 0 && (
        <section className="bg-stone-50 py-14">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <SectionHeader eyebrow={`${formatDateShort(isoDate(NEXT_FRI))} – ${formatDateShort(isoDate(NEXT_SUN))}`} title="Happening this weekend" action="See all" onAction={() => nav("events", { when: "weekend" })} />
            <HRow>
              {weekend.map((e) => (
                <div key={e.id} className="w-[260px] shrink-0">
                  <EventCard event={e} sectionBg="bg-stone-50" saved={savedIds.has(e.id)} onToggleSave={toggleSave} onOpen={openEvent} organizer={orgById(e.organizerId)} />
                </div>
              ))}
            </HRow>
          </div>
        </section>
      )}

      <section className="max-w-7xl mx-auto px-4 md:px-6 py-14">
        <SectionHeader eyebrow="24 categories" title="Explore by category" />
        <HRow>
          {CATEGORIES.map((c) => (
            <CategoryCard key={c.slug} cat={c} onClick={() => nav("events", { category: c.slug })} />
          ))}
        </HRow>
      </section>

      <section className="bg-stone-50 py-14">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <SectionHeader eyebrow="Local" title="What's happening near you" />
          <div className="flex gap-2 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
            {LOCATIONS.filter((l) => l !== "Other").map((l) => (
              <button key={l} onClick={() => nav("events", { city: l })} className="shrink-0 px-4 py-2 rounded-full bg-white border border-stone-200 text-sm font-semibold text-slate-700 hover:border-violet-400 hover:text-violet-700">
                {l}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            {approved.slice(0, 8).map((e) => (
              <EventCard key={e.id} event={e} sectionBg="bg-stone-50" saved={savedIds.has(e.id)} onToggleSave={toggleSave} onOpen={openEvent} organizer={orgById(e.organizerId)} />
            ))}
          </div>
        </div>
      </section>

      {free.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 md:px-6 py-14">
          <SectionHeader eyebrow="Zero cost" title="Free events" action="See all" onAction={() => nav("events", { free: true })} />
          <HRow>
            {free.map((e) => (
              <div key={e.id} className="w-[260px] shrink-0">
                <EventCard event={e} sectionBg="bg-white" saved={savedIds.has(e.id)} onToggleSave={toggleSave} onOpen={openEvent} organizer={orgById(e.organizerId)} />
              </div>
            ))}
          </HRow>
        </section>
      )}

      {featured.length > 0 && (
        <section className="bg-gradient-to-br from-amber-50 to-rose-50 py-14">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <SectionHeader eyebrow="Handpicked" title="Featured events" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {featured.map((e) => (
                <EventCard key={e.id} event={e} sectionBg="bg-amber-50" saved={savedIds.has(e.id)} onToggleSave={toggleSave} onOpen={openEvent} organizer={orgById(e.organizerId)} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="relative bg-slate-950 py-20 overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-gradient-to-tr from-violet-700 via-transparent to-rose-600" />
        <div className="relative max-w-2xl mx-auto px-6 text-center">
          <h2 className="font-display text-3xl md:text-5xl font-extrabold text-white mb-3">Have an event?</h2>
          <p className="text-indigo-200 text-lg mb-8">Give people a reason to show up.</p>
          <button onClick={() => nav("submit")} className="bg-rose-500 hover:bg-rose-600 text-white font-bold px-8 py-3.5 rounded-full transition">
            Submit Your Event
          </button>
        </div>
      </section>
    </div>
  );
}

/* ---------- Events discovery page ---------- */
function EventsPage({ nav, events, organizers, savedIds, toggleSave, openEvent, search, setSearch, filters, setFilters }) {
  const orgById = (id) => organizers.find((o) => o.id === id);
  const [sort, setSort] = useState("recommended");
  const [showFilters, setShowFilters] = useState(false);

  const results = useMemo(() => {
    let list = events.filter(isUpcomingApproved);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((e) => {
        const org = orgById(e.organizerId);
        return (
          e.title.toLowerCase().includes(q) ||
          e.venue.toLowerCase().includes(q) ||
          e.city.toLowerCase().includes(q) ||
          catBySlug(e.categorySlug).name.toLowerCase().includes(q) ||
          (org && org.name.toLowerCase().includes(q))
        );
      });
    }
    if (filters.category) list = list.filter((e) => e.categorySlug === filters.category);
    if (filters.city) list = list.filter((e) => e.city === filters.city);
    if (filters.free) list = list.filter((e) => e.price === 0);
    if (filters.type) list = list.filter((e) => e.eventType === filters.type);
    if (filters.when === "today") list = list.filter((e) => e.date === TODAY_STR);
    if (filters.when === "tomorrow") list = list.filter((e) => e.date === daysFromToday(1));
    if (filters.when === "weekend") list = list.filter((e) => isThisWeekend(e.date));
    if (filters.when === "week") list = list.filter((e) => isThisWeek(e.date));
    if (filters.when === "month") list = list.filter((e) => isThisMonth(e.date));

    if (sort === "newest") list = [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    else if (sort === "date") list = [...list].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    else list = [...list].sort(eventPromotionOrder);
    return list;
  }, [events, search, filters, sort]);

  const FilterChip = ({ active, onClick, children }) => (
    <button onClick={onClick} className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-stone-200 hover:border-slate-400"}`}>
      {children}
    </button>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
      <h1 className="font-display text-3xl md:text-4xl font-extrabold text-slate-900 mb-1">Explore events</h1>
      <p className="text-slate-500 mb-5">{results.length} upcoming event{results.length !== 1 ? "s" : ""} in Eswatini</p>

      <div className="flex items-center gap-2 bg-stone-100 rounded-full px-4 h-11 mb-4">
        <Search size={16} className="text-slate-400 shrink-0" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events, organizer, venue, city, category..." className="bg-transparent text-sm outline-none w-full" />
        {search && <button onClick={() => setSearch("")}><X size={15} className="text-slate-400" /></button>}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 mb-3 scrollbar-hide">
        <button onClick={() => setShowFilters((s) => !s)} className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border bg-white border-stone-200 text-slate-700">
          <Filter size={13} /> Filters
        </button>
        {["today", "tomorrow", "weekend", "week", "month"].map((w) => (
          <FilterChip key={w} active={filters.when === w} onClick={() => setFilters((f) => ({ ...f, when: f.when === w ? "" : w }))}>
            {w === "today" ? "Today" : w === "tomorrow" ? "Tomorrow" : w === "weekend" ? "This weekend" : w === "week" ? "This week" : "This month"}
          </FilterChip>
        ))}
        <FilterChip active={filters.free} onClick={() => setFilters((f) => ({ ...f, free: !f.free }))}>Free</FilterChip>
        <FilterChip active={filters.type === "online"} onClick={() => setFilters((f) => ({ ...f, type: f.type === "online" ? "" : "online" }))}>Online</FilterChip>
        <FilterChip active={filters.type === "in-person"} onClick={() => setFilters((f) => ({ ...f, type: f.type === "in-person" ? "" : "in-person" }))}>In-person</FilterChip>
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-stone-50 rounded-2xl p-4 mb-5">
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Category</label>
            <select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))} className="w-full text-sm border border-stone-200 rounded-lg px-2 py-2 bg-white">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Location</label>
            <select value={filters.city} onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))} className="w-full text-sm border border-stone-200 rounded-lg px-2 py-2 bg-white">
              <option value="">All locations</option>
              {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Sort by</label>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="w-full text-sm border border-stone-200 rounded-lg px-2 py-2 bg-white">
              <option value="recommended">Recommended</option>
              <option value="popular">Most popular</option>
              <option value="newest">Newest</option>
              <option value="date">Date</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={() => { setFilters({ category: "", city: "", free: false, type: "", when: "" }); setSort("recommended"); }} className="text-xs font-semibold text-rose-600 hover:underline">
              Clear all filters
            </button>
          </div>
        </div>
      )}

      {results.length === 0 ? (
        <EmptyState title="No events match your search" sub="Try clearing a filter or searching something else." />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {results.map((e) => (
            <EventCard key={e.id} event={e} sectionBg="bg-white" saved={savedIds.has(e.id)} onToggleSave={toggleSave} onOpen={openEvent} organizer={orgById(e.organizerId)} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Event detail page ---------- */
function EventDetailPage({ event, organizer, nav, savedIds, toggleSave, toast, related, openEvent, openOrganizer, attendanceStatus, canRate, onToggleAttendance, onSubmitRating }) {
  const [shareOpen, setShareOpen] = useState(false);
  if (!event) return <EmptyState title="Event not found" sub="This event may have been removed." />;
  const cat = catBySlug(event.categorySlug);
  const url = new URL(routePath("event", { slug: event.slug }), window.location.origin).toString();
  const shareText = encodeURIComponent(`${event.title} — ${formatDate(event.date)} in ${event.city}. Discovered on SHOW UP.`);

  return (
    <div>
      <div className="max-w-5xl mx-auto px-4 md:px-6 pt-6">
        <button onClick={() => nav("events")} className="flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800 mb-4">
          <ChevronLeft size={16} /> Back to events
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6">
        <div className="relative rounded-3xl overflow-hidden h-56 md:h-96">
          <img src={imgUrl(event.imageSeed, 1200, 700)} alt={event.title} className="w-full h-full object-cover" />
          {isPromotionActive(event) ? <SponsoredTag rank={event.sponsoredRank} /> : event.featured && <FeaturedTag />}
          <SaveHeart saved={savedIds.has(event.id)} onClick={() => toggleSave(event)} />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 mt-6 grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-violet-600 uppercase tracking-wide mb-2">
            <cat.icon size={13} /> {cat.name}
          </div>
          <h1 className="font-display text-2xl md:text-4xl font-extrabold text-slate-900 mb-4 leading-tight">{event.title}</h1>

          <div className="flex flex-wrap gap-4 mb-6 text-sm">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300"><Calendar size={16} className="text-rose-500" /> {formatDate(event.date)}</div>
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300"><Clock size={16} className="text-rose-500" /> {formatTime(event.startTime)} – {formatTime(event.endTime)}</div>
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300"><MapPin size={16} className="text-rose-500" /> {event.eventType === "online" ? "Online event" : `${event.venue}, ${event.city}`}</div>
            {event.attendeeCount && (
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <Users size={16} className="text-blue-500" /> {event.attendeeCount} people going
              </div>
            )}
            {event.rating && (
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <span className="text-lg">⭐</span> {event.rating.toFixed(1)} rating
              </div>
            )}
          </div>

          <h2 className="font-display font-bold text-lg text-slate-900 mb-2">About this event</h2>
          <p className="text-slate-600 leading-relaxed whitespace-pre-line mb-8">{event.description}</p>
          {canRate && <EventRatingForm event={event} onSubmit={onSubmitRating} />}

          {organizer && (
            <div className="border border-stone-200 rounded-2xl p-5 flex items-center gap-4 cursor-pointer hover:border-violet-300" onClick={() => openOrganizer(organizer)}>
              <img src={imgUrl(organizer.logoSeed, 100, 100)} className="w-14 h-14 rounded-full object-cover" alt={organizer.name} />
              <div className="flex-1">
                <div className="text-xs text-slate-400 font-mono uppercase tracking-wide">Organized by</div>
                <div className="font-display font-bold text-slate-900">{organizer.name}</div>
              </div>
              <ChevronRight size={18} className="text-slate-400" />
            </div>
          )}

          {related.length > 0 && (
            <div className="mt-10">
              <h2 className="font-display font-bold text-lg text-slate-900 mb-4">You might also like</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {related.map((e) => (
                  <EventCard key={e.id} event={e} saved={savedIds.has(e.id)} onToggleSave={toggleSave} onOpen={openEvent} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="md:col-span-1">
          <div className="sticky top-24 border border-stone-200 rounded-2xl p-5 bg-white shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-mono uppercase text-slate-400 tracking-wide">Price</span>
              <span className={`font-display text-2xl font-extrabold ${event.price === 0 ? "text-emerald-600" : "text-slate-900"}`}>{priceLabel(event.price)}</span>
            </div>
            <button disabled={attendanceStatus === "attended"} onClick={() => onToggleAttendance(event)} className={`w-full flex items-center justify-center gap-2 font-bold py-3 rounded-full mb-3 disabled:cursor-not-allowed ${attendanceStatus === "going" ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-indigo-950 hover:bg-indigo-900 text-white disabled:bg-emerald-50 disabled:text-emerald-700"}`}>
              <CheckCircle2 size={16} /> {attendanceStatus === "attended" ? "Attendance verified" : attendanceStatus === "going" ? "Cancel RSVP" : "I'm going"}
            </button>
            {event.eventType === "online" ? (
              <a href={event.onlineUrl || "#"} target="_blank" rel="noreferrer" className="w-full flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 rounded-full mb-3">
                <Globe size={16} /> Join Online
              </a>
            ) : event.ticketUrl ? (
              <a href={event.ticketUrl} target="_blank" rel="noreferrer" className="w-full flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 rounded-full mb-3">
                <Ticket size={16} /> Get Tickets
              </a>
            ) : (
              <div className="w-full flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 font-bold py-3 rounded-full mb-3">
                <CheckCircle2 size={16} /> Free entry, no ticket needed
              </div>
            )}
            <button onClick={() => toggleSave(event)} className="w-full flex items-center justify-center gap-2 border border-stone-200 hover:border-rose-300 text-slate-700 font-bold py-3 rounded-full mb-2">
              <Heart size={16} fill={savedIds.has(event.id) ? "#f43f5e" : "none"} className={savedIds.has(event.id) ? "text-rose-500" : ""} /> {savedIds.has(event.id) ? "Saved" : "Save Event"}
            </button>
            <div className="relative">
              <button onClick={() => setShareOpen((s) => !s)} className="w-full flex items-center justify-center gap-2 border border-stone-200 hover:border-violet-300 text-slate-700 font-bold py-3 rounded-full">
                <Share2 size={16} /> Share
              </button>
              {shareOpen && (
                <div className="absolute top-full mt-2 left-0 right-0 bg-white border border-stone-200 rounded-2xl shadow-lg p-2 z-20">
                  <a href={`https://wa.me/?text=${shareText}%20${encodeURIComponent(url)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-stone-50 text-sm font-semibold text-slate-700"><MessageCircle size={16} className="text-emerald-500" /> WhatsApp</a>
                  <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-stone-50 text-sm font-semibold text-slate-700"><Globe size={16} className="text-blue-600" /> Facebook</a>
                  <a href={`https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-stone-50 text-sm font-semibold text-slate-700"><AtSign size={16} className="text-slate-800" /> X</a>
                  <button onClick={() => { navigator.clipboard?.writeText(url); toast("Link copied"); setShareOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-stone-50 text-sm font-semibold text-slate-700"><Copy size={16} /> Copy link</button>
                </div>
              )}
            </div>

            <div className="mt-5 pt-5 border-t border-stone-100 text-sm text-slate-500 space-y-2">
              {event.contactInfo && <div className="flex items-center gap-2"><Mail size={14} /> {event.contactInfo}</div>}
              <div className="flex items-center gap-2"><MapPin size={14} /> {event.address}, {event.country}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Organizer profile page ---------- */
function OrganizerPage({ organizer, events, nav, savedIds, toggleSave, openEvent, isFollowing, onToggleFollow }) {
  if (!organizer) return <EmptyState title="Organizer not found" />;
  const orgEvents = events.filter((e) => e.organizerId === organizer.id && e.status === "approved");
  const upcoming = orgEvents.filter((e) => e.date >= TODAY_STR).sort((a, b) => a.date.localeCompare(b.date));
  const past = orgEvents.filter((e) => e.date < TODAY_STR).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      <div className="bg-gradient-to-br from-indigo-950 to-violet-900 pt-14 pb-24">
        <div className="max-w-5xl mx-auto px-4 md:px-6 flex items-center gap-5">
          <img src={imgUrl(organizer.logoSeed, 160, 160)} className="w-24 h-24 rounded-2xl object-cover shadow-xl border-4 border-white/10" alt={organizer.name} />
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-extrabold text-white">{organizer.name}</h1>
            <div className="flex items-center gap-1.5 text-indigo-200 text-sm mt-1"><MapPin size={14} /> {organizer.location}</div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 -mt-12 grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
          <p className="text-slate-600 leading-relaxed mb-4">{organizer.description}</p>
          <div className="flex flex-wrap gap-3 text-sm text-slate-500">
            {organizer.website && <a href={organizer.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-violet-700"><Globe size={14} />Website</a>}
            {organizer.instagram && <span className="flex items-center gap-1.5"><MessageCircle size={14} />{organizer.instagram}</span>}
            {organizer.facebook && <span className="flex items-center gap-1.5"><Globe size={14} />{organizer.facebook}</span>}
            {organizer.x && <span className="flex items-center gap-1.5"><AtSign size={14} />{organizer.x}</span>}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 flex flex-col gap-3 h-fit">
          <button onClick={onToggleFollow} className={`w-full font-bold py-3 rounded-full transition ${isFollowing ? "bg-slate-100 text-slate-700" : "bg-rose-500 text-white hover:bg-rose-600"}`}>
            {isFollowing ? "Following" : "Follow Organizer"}
          </button>
          {organizer.email && <div className="flex items-center gap-2 text-sm text-slate-500"><Mail size={14} /> {organizer.email}</div>}
          {organizer.phone && <div className="flex items-center gap-2 text-sm text-slate-500"><Phone size={14} /> {organizer.phone}</div>}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-10">
        <h2 className="font-display text-xl font-extrabold text-slate-900 mb-4">Upcoming events ({upcoming.length})</h2>
        {upcoming.length === 0 ? <p className="text-sm text-slate-400 mb-8">No upcoming events right now.</p> : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
            {upcoming.map((e) => <EventCard key={e.id} event={e} saved={savedIds.has(e.id)} onToggleSave={toggleSave} onOpen={openEvent} />)}
          </div>
        )}
        {past.length > 0 && (
          <>
            <h2 className="font-display text-xl font-extrabold text-slate-900 mb-4">Past events</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 opacity-70">
              {past.map((e) => <EventCard key={e.id} event={e} saved={savedIds.has(e.id)} onToggleSave={toggleSave} onOpen={openEvent} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Auth pages ---------- */
function AuthShell({ title, sub, children }) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16 bg-stone-50">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-sm border border-stone-100 p-8">
        <h1 className="font-display text-2xl font-extrabold text-slate-900 mb-1">{title}</h1>
        <p className="text-sm text-slate-500 mb-6">{sub}</p>
        {children}
      </div>
    </div>
  );
}
function TextField({ label, ...props }) {
  return (
    <div className="mb-4">
      <label className="text-xs font-semibold text-slate-600 block mb-1.5">{label}</label>
      <input {...props} className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
    </div>
  );
}

function validateNewPassword(password, confirmation) {
  if (password.length < 12) return "Password must be at least 12 characters.";
  if (password !== confirmation) return "Passwords do not match.";
  return null;
}

function LoginPage({ nav, onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <AuthShell title="Welcome back" sub="Log in to save events, follow organizers and manage submissions.">
      <form onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const err = await onLogin(email, password);
          if (err) setError(err);
        } catch (cause) {
          setError(cause.message || "Could not log in.");
        } finally {
          setBusy(false);
        }
      }}>
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
        <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
        {error && <p role="alert" className="text-xs text-rose-600 mb-3">{error}</p>}
        <button disabled={busy} className="w-full bg-slate-900 text-white font-bold py-3 rounded-full mb-3 disabled:opacity-60">{busy ? "Logging in..." : "Log in"}</button>
      </form>
      <p className="text-sm text-center mb-4"><button onClick={() => nav("forgot-password")} className="text-violet-700 font-semibold">Forgot your password?</button></p>
      <p className="text-sm text-slate-500 text-center">No account? <button onClick={() => nav("signup")} className="text-violet-700 font-semibold">Sign up</button></p>
    </AuthShell>
  );
}

function ForgotPasswordPage({ nav }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <AuthShell title="Reset your password" sub="We’ll email you a secure link to choose a new password.">
      {sent ? (
        <p role="status" className="text-sm text-emerald-700 bg-emerald-50 rounded-xl p-4 mb-4">If an account exists for that address, a password reset link has been sent.</p>
      ) : (
        <form onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await requestPasswordReset(email.trim());
            setSent(true);
          } catch (cause) {
            setError(cause.message || "Could not send a recovery email.");
          } finally {
            setBusy(false);
          }
        }}>
          <TextField label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          {error && <p role="alert" className="text-sm text-rose-600 mb-3">{error}</p>}
          <button disabled={busy} className="w-full bg-slate-900 text-white font-bold py-3 rounded-full mb-4 disabled:opacity-60">{busy ? "Sending..." : "Send reset link"}</button>
        </form>
      )}
      <p className="text-sm text-slate-500 text-center"><button onClick={() => nav("login")} className="text-violet-700 font-semibold">Back to log in</button></p>
    </AuthShell>
  );
}

function PasswordRecoveryPage({ nav, onReset }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <AuthShell title="Choose a new password" sub="Use at least 12 characters for your new password.">
      <form onSubmit={async (event) => {
        event.preventDefault();
        const invalid = validateNewPassword(password, confirmation);
        if (invalid) {
          setError(invalid);
          return;
        }
        setBusy(true);
        setError("");
        try {
          await onReset(password);
          nav("login");
        } catch (cause) {
          setError(cause.message || "Could not reset your password. Request a new link.");
        } finally {
          setBusy(false);
        }
      }}>
        <TextField label="New password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} autoComplete="new-password" required />
        <TextField label="Confirm new password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={12} autoComplete="new-password" required />
        {error && <p role="alert" className="text-sm text-rose-600 mb-3">{error}</p>}
        <button disabled={busy} className="w-full bg-slate-900 text-white font-bold py-3 rounded-full disabled:opacity-60">{busy ? "Updating..." : "Update password"}</button>
      </form>
    </AuthShell>
  );
}

function SignupPage({ nav, onSignup }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendError, setResendError] = useState("");
  const [resending, setResending] = useState(false);
  return (
    <AuthShell title="Create your account" sub="Join SHOW UP to save events, follow organizers and submit your own.">
      <form onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setMessage("");
        setResendMessage("");
        setResendError("");
        try {
          const result = await onSignup(name, email, password, confirmPassword);
          if (result?.error) setError(result.error);
          if (result?.message) setMessage(result.message);
        } catch (cause) {
          setError(cause.message || "Could not create your account.");
        } finally {
          setBusy(false);
        }
      }}>
        <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 12 characters" minLength={12} autoComplete="new-password" required />
        <TextField label="Confirm password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Enter your password again" minLength={12} autoComplete="new-password" required />
        {error && <p role="alert" className="text-xs text-rose-600 mb-3">{error}</p>}
        {message && <p role="status" className="text-sm text-emerald-700 bg-emerald-50 rounded-xl p-3 mb-3">{message}</p>}
        <button disabled={busy} className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 rounded-full mb-3 disabled:opacity-60">{busy ? "Creating account..." : "Sign up"}</button>
      </form>
      <div className="mb-3 text-center">
        <button
          type="button"
          disabled={resending || !email.trim()}
          onClick={async () => {
            setResending(true);
            setResendMessage("");
            setResendError("");
            try {
              await resendSignupConfirmation(email);
              setResendMessage("Confirmation email sent. Check your inbox and spam folder.");
            } catch (cause) {
              setResendError(cause.message || "Could not resend the confirmation email.");
            } finally {
              setResending(false);
            }
          }}
          className="text-sm font-semibold text-violet-700 hover:text-violet-900 disabled:opacity-60"
        >
          {resending ? "Sending..." : "Resend confirmation email"}
        </button>
        {resendMessage && <p role="status" className="text-xs text-emerald-700 mt-2">{resendMessage}</p>}
        {resendError && <p role="alert" className="text-xs text-rose-600 mt-2">{resendError}</p>}
      </div>
      <p className="text-sm text-slate-500 text-center">Already have an account? <button onClick={() => nav("login")} className="text-violet-700 font-semibold">Log in</button></p>
    </AuthShell>
  );
}

function HostApplicationPage({ currentUser, nav, onSubmit }) {
  const [form, setForm] = useState({
    organizationName: "",
    description: "",
    location: "",
    website: "",
    phone: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pendingApplication, setPendingApplication] = useState(null);
  const [applicationStatus, setApplicationStatus] = useState(() => currentUser?.role === "user" ? "loading" : "none");
  const set = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }));

  useEffect(() => {
    if (!currentUser?.id || currentUser.role !== "user") return;
    let active = true;
    getMyPendingHostApplication(currentUser.id)
      .then((application) => {
        if (!active) return;
        setPendingApplication(application);
        setApplicationStatus(application ? "pending" : "none");
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause.message || "Could not check your host application status.");
        setApplicationStatus("error");
      });
    return () => { active = false; };
  }, [currentUser?.id, currentUser?.role]);

  if (!currentUser) return <EmptyState icon={Building2} title="Log in to apply to host" sub="Create an account to apply to publish events." />;
  if (currentUser.role !== "user") return <EmptyState icon={Building2} title="Host access already enabled" sub="Your approved host account can submit events." />;
  if (applicationStatus === "loading") {
    return <div className="max-w-xl mx-auto px-4 py-16 text-center text-slate-600">Checking your host application status…</div>;
  }
  if (applicationStatus === "pending") {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <Clock size={40} className="mx-auto text-amber-600 mb-4" />
        <h1 className="font-display text-2xl font-extrabold text-slate-900 mb-2">Host application under review</h1>
        <p className="text-slate-600 mb-2">You already have an application awaiting review. You can submit events after an administrator approves it.</p>
        {pendingApplication?.submitted_at && <p className="text-sm text-slate-500 mb-6">Submitted {formatDateShort(pendingApplication.submitted_at.slice(0, 10))}</p>}
        <button onClick={() => nav("profile")} className="bg-slate-900 text-white font-bold px-5 py-2.5 rounded-full">Back to profile</button>
      </div>
    );
  }
  if (submitted) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <CheckCircle2 size={40} className="mx-auto text-emerald-600 mb-4" />
        <h1 className="font-display text-2xl font-extrabold text-slate-900 mb-2">Application submitted</h1>
        <p className="text-slate-600 mb-6">An administrator will review your host application. You’ll be able to submit events after approval.</p>
        <button onClick={() => nav("profile")} className="bg-slate-900 text-white font-bold px-5 py-2.5 rounded-full">Back to profile</button>
      </div>
    );
  }
  return (
    <div className="max-w-xl mx-auto px-4 md:px-6 py-10">
      <h1 className="font-display text-3xl font-extrabold text-slate-900 mb-2">Apply to host events</h1>
      <p className="text-slate-500 mb-7">Tell us about your organization. An admin must approve your application before you can submit events.</p>
      <form onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
          await onSubmit(form);
          setSubmitted(true);
        } catch (cause) {
          setError(cause.message || "Could not submit your application.");
        } finally {
          setBusy(false);
        }
      }}>
        <TextField label="Organization name" value={form.organizationName} onChange={set("organizationName")} minLength={2} maxLength={160} required />
        <div className="mb-4">
          <label className="text-xs font-semibold text-slate-600 block mb-1.5">What do you do?</label>
          <textarea value={form.description} onChange={set("description")} minLength={20} maxLength={3000} rows={4} className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-violet-400" required />
        </div>
        <TextField label="City or area" value={form.location} onChange={set("location")} minLength={2} maxLength={120} required />
        <TextField label="Website (HTTPS)" type="url" value={form.website} onChange={set("website")} placeholder="https://example.com" />
        <TextField label="Contact phone (optional)" type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" />
        {error && <p role="alert" className="text-sm text-rose-600 mb-3">{error}</p>}
        <button disabled={busy} className="w-full bg-rose-500 hover:bg-rose-600 disabled:opacity-60 text-white font-bold py-3 rounded-full">{busy ? "Submitting..." : "Submit application"}</button>
      </form>
    </div>
  );
}

/* ---------- Saved events ---------- */
function SavedPage({ events, organizers, savedIds, toggleSave, openEvent, nav, currentUser }) {
  if (!currentUser) return <EmptyState icon={Bookmark} title="Log in to see your saved events" sub="Create a free account to start saving events." />;
  const list = events.filter((e) => savedIds.has(e.id));
  const orgById = (id) => organizers.find((o) => o.id === id);
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
      <h1 className="font-display text-3xl font-extrabold text-slate-900 mb-1">Saved events</h1>
      <p className="text-slate-500 mb-6">{list.length} event{list.length !== 1 ? "s" : ""} saved</p>
      {list.length === 0 ? (
        <EmptyState icon={Bookmark} title="No saved events yet" sub="Tap the heart on any event to save it here." />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {list.map((e) => <EventCard key={e.id} event={e} saved onToggleSave={toggleSave} onOpen={openEvent} organizer={orgById(e.organizerId)} />)}
        </div>
      )}
    </div>
  );
}

function ChangePasswordForm({ onChangePassword }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaved(false);
    const passwordError = validateNewPassword(newPassword, confirmPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    try {
      const result = await onChangePassword(currentPassword, newPassword);
      if (result) {
        setError(result);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSaved(true);
    } catch (cause) {
      setError(cause.message || "Could not change your password.");
    }
  }

  return (
    <section className="bg-white border border-stone-200 rounded-2xl p-5 mb-10">
      <h2 className="font-display text-lg font-extrabold text-slate-900 mb-1">Change password</h2>
      <p className="text-sm text-slate-500 mb-4">Enter your current password, then choose a new password of at least 12 characters.</p>
      <form onSubmit={submit} className="max-w-md">
        <TextField label="Current password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
        <TextField label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={12} autoComplete="new-password" required />
        <TextField label="Confirm new password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={12} autoComplete="new-password" required />
        {error && <p role="alert" className="text-sm text-rose-600 mb-3">{error}</p>}
        {saved && <p role="status" className="text-sm text-emerald-700 mb-3">Password changed successfully.</p>}
        <button className="bg-slate-900 text-white font-bold px-5 py-2.5 rounded-full">Update password</button>
      </form>
    </section>
  );
}

/* ---------- Profile page ---------- */
function ProfilePage({ currentUser, events, organizers, followedIds, nav, onLogout, onChangePassword }) {
  if (!currentUser) return <EmptyState icon={User} title="Log in to view your profile" />;
  const myEvents = events.filter((e) => {
    const org = organizers.find((o) => o.id === e.organizerId);
    return org && org.userId === currentUser.id;
  });
  const followedOrgs = organizers.filter((o) => followedIds.has(o.id));
  const statusStyle = { pending: "bg-amber-100 text-amber-700", approved: "bg-emerald-100 text-emerald-700", rejected: "bg-rose-100 text-rose-700", expired: "bg-slate-100 text-slate-500" };

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-10">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-full bg-indigo-950 text-amber-300 flex items-center justify-center font-display font-extrabold text-2xl">{currentUser.name.charAt(0)}</div>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-slate-900">{currentUser.name}</h1>
          <p className="text-slate-500 text-sm">{currentUser.email} &middot; <span className="capitalize">{currentUser.role}</span></p>
        </div>
        <button onClick={onLogout} className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-rose-600 hover:underline"><LogOut size={15} /> Log out</button>
      </div>

      {currentUser.role === "user" && (
        <div className="bg-violet-50 border border-violet-100 rounded-2xl p-5 mb-8 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h2 className="font-bold text-slate-900">Want to host events?</h2>
            <p className="text-sm text-slate-600">Apply for an organizer account. Hosts are reviewed before they can publish.</p>
          </div>
          <button onClick={() => nav("host")} className="bg-violet-700 text-white font-semibold px-4 py-2.5 rounded-full">Apply to host</button>
        </div>
      )}

      <ChangePasswordForm onChangePassword={onChangePassword} />

      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-2xl font-extrabold text-slate-900">Your Events</h2>
            <p className="text-sm text-slate-500 mt-1">{myEvents.length} event{myEvents.length !== 1 ? "s" : ""} submitted</p>
          </div>
          <button onClick={() => nav("submit")} className="flex items-center gap-2 px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-full transition">
            <Plus size={18} /> Submit Event
          </button>
        </div>

        {myEvents.length === 0 ? (
          <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border-2 border-dashed border-violet-200 rounded-2xl p-8 text-center">
            <Plus size={32} className="mx-auto text-violet-400 mb-3" />
            <p className="font-semibold text-slate-900 mb-1">No events submitted yet</p>
            <p className="text-sm text-slate-500 mb-4">Start by creating your first event for Eswatini</p>
            <button onClick={() => nav("submit")} className="px-6 py-2 bg-violet-600 text-white rounded-full font-semibold text-sm hover:bg-violet-700 transition">Create Event</button>
          </div>
        ) : (
          <div className="space-y-3">
            {myEvents.map((e) => {
              const status = getEffectiveStatus(e);
              const isPending = status === "pending";
              return (
                <div key={e.id} className={`border-2 rounded-2xl p-4 cursor-pointer transition ${isPending ? "bg-amber-50 border-amber-200 hover:border-amber-400" : "bg-white border-stone-200 hover:border-violet-300"}`} onClick={() => nav("event", { slug: e.slug })}>
                  <div className="flex items-start gap-4">
                    <img src={imgUrl(e.imageSeed, 100, 100)} className="w-16 h-16 rounded-xl object-cover shrink-0" alt="" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <div className="font-display font-bold text-lg text-slate-900">{e.title}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{formatDateShort(e.date)} at {e.startTime} • {e.venue || e.city}</div>
                        </div>
                        <span className={`text-[12px] font-bold px-3 py-1 rounded-full whitespace-nowrap capitalize ${
                          status === "pending" ? "bg-amber-200 text-amber-800" :
                          status === "approved" ? "bg-emerald-200 text-emerald-800" :
                          status === "rejected" ? "bg-rose-200 text-rose-800" :
                          "bg-slate-200 text-slate-700"
                        }`}>
                          {status}
                        </span>
                      </div>
                      
                      {isPending && (
                        <div className="mt-2 p-2 bg-amber-100 rounded-lg border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                          <Clock size={14} className="mt-0.5 shrink-0" />
                          <div>
                            <p className="font-semibold">Under review</p>
                            <p>Your event will be reviewed and approved within <strong>24-48 hours</strong>. We'll email you when it's live!</p>
                          </div>
                        </div>
                      )}
                      {status === "approved" && (
                        <div className="mt-2 p-2 bg-emerald-100 rounded-lg border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
                          <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                          <p><strong>Published!</strong> Your event is now live on SHOW UP and people can save it.</p>
                        </div>
                      )}
                      {status === "rejected" && (
                        <div className="mt-2 p-2 bg-rose-100 rounded-lg border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                          <XCircle size={14} className="mt-0.5 shrink-0" />
                          <p><strong>Not approved.</strong> Please contact us at hello@showup.sz if you'd like to resubmit.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="font-display text-lg font-extrabold text-slate-900 mb-3">Following ({followedOrgs.length})</h2>
        {followedOrgs.length === 0 ? (
          <div className="bg-stone-50 rounded-2xl p-6 text-sm text-slate-500">You're not following any organizers yet.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {followedOrgs.map((o) => (
              <div key={o.id} onClick={() => nav("organizer", { slug: slugify(o.name) })} className="flex items-center gap-3 border border-stone-200 rounded-xl p-3 cursor-pointer hover:border-violet-300">
                <img src={imgUrl(o.logoSeed, 100, 100)} className="w-10 h-10 rounded-full object-cover" alt="" />
                <span className="text-sm font-semibold text-slate-800 truncate">{o.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Submit event ---------- */
const emptyForm = {
  title: "", category: "music", description: "", date: "", startTime: "", endTime: "",
  eventType: "in-person", price: "0", ticketUrl: "", venue: "", address: "", city: "Mbabane",
  country: "Eswatini", onlineUrl: "", contactEmail: "",
};

function SubmitEventPage({ currentUser, nav, onSubmitEvent, existingOrganizer }) {
  const [form, setForm] = useState(emptyForm);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (!currentUser) {
    return (
      <EmptyState icon={Plus} title="Log in to submit an event" sub="Create a free account first — it only takes a minute." />
    );
  }
  if (!existingOrganizer) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <Building2 size={40} className="mx-auto text-violet-600 mb-4" />
        <h1 className="font-display text-2xl font-extrabold text-slate-900 mb-2">Host approval required</h1>
        <p className="text-slate-600 mb-6">Your account needs an approved host profile before you can submit events. If you have already applied, check your application status.</p>
        <button onClick={() => nav("host")} className="bg-rose-500 hover:bg-rose-600 text-white font-bold px-5 py-3 rounded-full">Check host application</button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20">
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-3xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto mb-6"><CheckCircle2 size={32} /></div>
          
          <h1 className="font-display text-3xl font-extrabold text-slate-900 mb-3">Event submitted! 🎉</h1>
          
          <div className="bg-white rounded-2xl p-5 mb-6 border border-emerald-100">
            <p className="text-slate-600 font-semibold mb-3 text-sm">⏱️ Review Timeline</p>
            <div className="space-y-2">
              <p className="text-slate-700 font-semibold">Your event will be reviewed and approved within <span className="text-emerald-600 font-extrabold">24 to 48 hours</span>.</p>
              <p className="text-xs text-slate-500">We check all submissions to ensure quality and accuracy before publishing.</p>
            </div>
          </div>

          <div className="space-y-2 mb-8 text-left">
            <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-stone-200">
              <span className="text-lg">✅</span>
              <div className="text-sm">
                <p className="font-semibold text-slate-800">Submission received</p>
                <p className="text-xs text-slate-500">We've got your event details</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-stone-200">
              <span className="text-lg">👀</span>
              <div className="text-sm">
                <p className="font-semibold text-slate-800">Under review</p>
                <p className="text-xs text-slate-500">Our team will verify all details</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-stone-200 opacity-60">
              <span className="text-lg">🚀</span>
              <div className="text-sm">
                <p className="font-semibold text-slate-800">Published</p>
                <p className="text-xs text-slate-500">Your event goes live on SHOW UP</p>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-500 mb-6">Check your email for updates. You can also view your events in your profile dashboard.</p>

          <div className="flex items-center justify-center gap-3">
            <button onClick={() => nav("profile")} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-full transition">📊 View my events</button>
            <button onClick={() => { setForm(emptyForm); setDone(false); }} className="border border-emerald-300 text-emerald-700 hover:bg-emerald-50 font-bold px-6 py-3 rounded-full transition">➕ Submit another</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-10">
      <h1 className="font-display text-3xl font-extrabold text-slate-900 mb-1">Submit your event</h1>
      <p className="text-slate-500 mb-8">Fill in the details below. It takes about two minutes.</p>

      <form onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          await           onSubmitEvent(form, imageFile);
          setDone(true);
        } catch (cause) {
          setError(cause.message || "Could not submit this event.");
        }
      }}>
        <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-5">
          <h2 className="font-display font-bold text-slate-900 mb-4">Event information</h2>
          <TextField label="Event title" value={form.title} onChange={set("title")} required placeholder="e.g. Mbabane Comedy Night" />
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Category</label>
              <select value={form.category} onChange={set("category")} className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm">
                {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Event type</label>
              <select value={form.eventType} onChange={set("eventType")} className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm">
                <option value="in-person">In-person</option>
                <option value="online">Online</option>
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Description</label>
            <textarea value={form.description} onChange={set("description")} required rows={4} placeholder="What can attendees expect?" className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-violet-400" />
          </div>
          <div className="mb-4">
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Event image</label>
            <div className="border-2 border-dashed border-stone-200 rounded-xl p-5 text-sm text-slate-600">
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImageFile(event.target.files?.[0] || null)} />
              <p className="text-xs text-slate-500 mt-2">Optional JPEG, PNG, or WebP image; maximum 5 MB.</p>
              {imageFile && <p className="text-xs text-emerald-700 mt-1">{imageFile.name}</p>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <TextField label="Date" type="date" value={form.date} onChange={set("date")} required min={TODAY_STR} />
            <TextField label="Start time" type="time" value={form.startTime} onChange={set("startTime")} required />
            <TextField label="End time" type="time" value={form.endTime} onChange={set("endTime")} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Price (SZL, 0 = free)" type="number" min="0" value={form.price} onChange={set("price")} required />
            <TextField label="External ticket URL (optional)" value={form.ticketUrl} onChange={set("ticketUrl")} placeholder="https://..." />
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-5">
          <h2 className="font-display font-bold text-slate-900 mb-4">Location</h2>
          {form.eventType === "online" ? (
            <TextField label="Online event URL" value={form.onlineUrl} onChange={set("onlineUrl")} placeholder="https://meet.example.com/..." required />
          ) : (
            <>
              <TextField label="Venue" value={form.venue} onChange={set("venue")} required placeholder="e.g. The Waterford Hall" />
              <TextField label="Address" value={form.address} onChange={set("address")} required placeholder="Street address" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1.5">City</label>
                  <select value={form.city} onChange={set("city")} className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm">
                    {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <TextField label="Country" value={form.country} onChange={set("country")} required />
              </div>
            </>
          )}
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-6">
          <h2 className="font-display font-bold text-slate-900 mb-4">Organizer</h2>
          <p className="font-semibold text-slate-800">{existingOrganizer.name}</p>
          <p className="text-sm text-slate-500 mt-1">{existingOrganizer.location} · {existingOrganizer.email}</p>
        </div>

        <div className="bg-violet-50 text-violet-800 text-sm rounded-xl p-4 mb-5 flex items-start gap-2">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" />
          Your event will be reviewed before appearing publicly on SHOW UP.
        </div>

        {error && <p role="alert" className="text-sm text-rose-600 mb-3">{error}</p>}
        <button className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-3.5 rounded-full">Submit Event</button>
      </form>
    </div>
  );
}

/* ============================================================================
   ADMIN
============================================================================ */
function AdminShell({ tab, setTab, children }) {
  const tabs = [
    ["dashboard", "Dashboard", LayoutDashboard], ["events", "Events", Calendar], ["pending", "Pending Events", Clock],
    ["hosts", "Host Applications", Building2], ["users", "Users", Users], ["organizers", "Organizers", Building2], ["categories", "Categories", Palette],
    ["locations", "Locations", MapPin], ["featured", "Featured Events", Star], ["ads", "Advertising", Sparkles],
  ];
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 flex flex-col md:flex-row gap-6">
      <div className="md:w-56 shrink-0">
        <h1 className="font-display text-xl font-extrabold text-slate-900 mb-4 flex items-center gap-2"><ShieldCheck size={20} className="text-violet-600" /> Admin</h1>
        <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0 scrollbar-hide">
          {tabs.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)} className={`shrink-0 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-left transition ${tab === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-stone-100"}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tint }) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${tint}`}><Icon size={16} /></div>
      <div className="font-display text-2xl font-extrabold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function AdminDashboardHome({ events, users, organizers }) {
  const attendanceTotal = events.reduce((total, event) => total + (event.attendanceCount || 0), 0);
  const rsvpTotal = events.reduce((total, event) => total + (event.attendeeCount || 0), 0);
  const ratingTotal = events.reduce((total, event) => total + (event.ratingCount || 0), 0);
  const stats = {
    users: users.length,
    organizers: organizers.length,
    events: events.length,
    pending: events.filter((e) => e.status === "pending").length,
    published: events.filter((e) => isUpcomingApproved(e)).length,
    expired: events.filter((e) => getEffectiveStatus(e) === "expired").length,
    featured: events.filter((e) => e.featured).length,
  };
  return (
    <div>
      <h2 className="font-display text-2xl font-extrabold text-slate-900 mb-5">Platform overview</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Total users" value={stats.users} icon={Users} tint="bg-violet-100 text-violet-700" />
        <StatCard label="Total organizers" value={stats.organizers} icon={Building2} tint="bg-indigo-100 text-indigo-700" />
        <StatCard label="Total events" value={stats.events} icon={Calendar} tint="bg-rose-100 text-rose-700" />
        <StatCard label="Pending events" value={stats.pending} icon={Clock} tint="bg-amber-100 text-amber-700" />
        <StatCard label="Published events" value={stats.published} icon={CheckCircle2} tint="bg-emerald-100 text-emerald-700" />
        <StatCard label="Expired events" value={stats.expired} icon={XCircle} tint="bg-slate-100 text-slate-500" />
        <StatCard label="Featured events" value={stats.featured} icon={Star} tint="bg-amber-100 text-amber-700" />
        <StatCard label="Current RSVPs" value={rsvpTotal} icon={Users} tint="bg-blue-100 text-blue-700" />
        <StatCard label="Verified attendance" value={attendanceTotal} icon={CheckCircle2} tint="bg-emerald-100 text-emerald-700" />
        <StatCard label="Event ratings" value={ratingTotal} icon={Star} tint="bg-amber-100 text-amber-700" />
      </div>
      <p className="text-sm text-slate-500">Operational metrics are calculated from verified platform activity and attendance records.</p>
    </div>
  );
}

function AdminEventRow({ e, organizer, onApprove, onReject, onDelete, onFeature, showActions = true }) {
  const status = getEffectiveStatus(e);
  const style = { pending: "bg-amber-100 text-amber-700", approved: "bg-emerald-100 text-emerald-700", rejected: "bg-rose-100 text-rose-700", expired: "bg-slate-100 text-slate-500", draft: "bg-slate-100 text-slate-500" };
  return (
    <div>
      <div className="flex items-center gap-3 border border-stone-200 rounded-xl p-3">
        <img src={imgUrl(e.imageSeed, 100, 100)} className="w-12 h-12 rounded-lg object-cover shrink-0" alt="" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-800 text-sm truncate">{e.title}</div>
          <div className="text-xs text-slate-400 truncate">{organizer?.name} &middot; {formatDateShort(e.date)} &middot; {e.city}</div>
        </div>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full capitalize shrink-0 ${style[status] || style.draft}`}>{status}</span>
        {showActions && (
          <div className="flex items-center gap-1 shrink-0">
            {status === "pending" && (
              <>
                <button title="Approve" onClick={() => onApprove(e)} className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100"><CheckCircle2 size={15} /></button>
                <button title="Reject" onClick={() => onReject(e)} className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-100"><XCircle size={15} /></button>
              </>
            )}
            <button title={e.featured ? "Unfeature" : "Feature"} onClick={() => onFeature(e)} className={`w-8 h-8 rounded-lg flex items-center justify-center ${e.featured ? "bg-amber-400 text-white" : "bg-stone-100 text-slate-500 hover:bg-amber-50"}`}><Star size={15} fill={e.featured ? "currentColor" : "none"} /></button>
            <button title="Delete" onClick={() => {
              if (window.confirm(`Delete "${e.title}" permanently? This also removes its RSVPs, saved entries, and ratings. Payment history is retained.`)) onDelete(e);
            }} className="w-8 h-8 rounded-lg bg-stone-100 text-slate-500 flex items-center justify-center hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
          </div>
        )}
      </div>
      {showActions && (
        <AdminAttendancePanel event={e} />
      )}
    </div>
  );
}

function AdminAttendancePanel({ event }) {
  const [open, setOpen] = useState(false);
  const [attendees, setAttendees] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setOpen((value) => !value);
    if (open || attendees.length) return;
    setLoading(true);
    setError("");
    try {
      setAttendees(await listEventAttendees(event.id));
    } catch (cause) {
      setError(cause.message || "Could not load event attendees.");
    } finally {
      setLoading(false);
    }
  }

  async function checkIn(attendee) {
    setError("");
    try {
      await markAttendeePresent(event.id, attendee.user_id);
      setAttendees((previous) => previous.map((row) => row.user_id === attendee.user_id ? { ...row, status: "attended" } : row));
    } catch (cause) {
      setError(cause.message || "Could not record attendance.");
    }
  }

  return (
    <div className="px-3 pb-3">
      <button onClick={toggle} className="text-xs font-semibold text-violet-700 flex items-center gap-1.5">
        <Users size={14} /> {open ? "Hide attendees" : "Manage attendance"}
      </button>
      {open && (
        <div className="mt-2 rounded-xl bg-stone-50 p-3">
          {loading && <p className="text-xs text-slate-500">Loading attendees...</p>}
          {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
          {!loading && !attendees.length && !error && <p className="text-xs text-slate-500">No RSVPs yet.</p>}
          <div className="space-y-2">
            {attendees.map((attendee) => (
              <div key={attendee.user_id} className="flex items-center gap-3 text-sm">
                <span className="flex-1 text-slate-700">{attendee.profiles?.full_name || "Member"}</span>
                <span className="text-xs capitalize text-slate-500">{attendee.status}</span>
                {attendee.status === "going" && (
                  <button onClick={() => checkIn(attendee)} className="text-xs font-semibold text-emerald-700">Mark attended</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AdminEventCreateForm({ organizers, onCreate }) {
  const emptyForm = {
    title: "",
    description: "",
    organizerId: "",
    category: CATEGORIES[0].slug,
    eventType: "in-person",
    date: "",
    startTime: "18:00",
    endTime: "20:00",
    venue: "",
    address: "",
    city: LOCATIONS[0],
    country: "Eswatini",
    price: "0",
    ticketUrl: "",
    onlineUrl: "",
    contactEmail: "",
  };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }));

  return (
    <section className="bg-white border border-stone-200 rounded-2xl p-4 mb-5">
      <button onClick={() => { setOpen((value) => !value); setError(""); }} className="flex items-center gap-2 text-sm font-bold text-violet-700">
        <Plus size={16} /> {open ? "Close event form" : "Add an event"}
      </button>
      {open && (
        <form onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onCreate(form);
            setForm(emptyForm);
            setOpen(false);
          } catch (cause) {
            setError(cause.message || "Could not create the event.");
          } finally {
            setBusy(false);
          }
        }} className="mt-4 border-t border-stone-100 pt-4">
          {!organizers.length && <p className="text-sm text-amber-700 mb-3">Approve a host before adding an event.</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            <TextField label="Event title" value={form.title} onChange={set("title")} minLength={3} maxLength={180} required />
            <div className="mb-4">
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Organizer</label>
              <select value={form.organizerId} onChange={set("organizerId")} className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm" required>
                <option value="">Choose organizer</option>
                {organizers.map((organizer) => <option key={organizer.id} value={organizer.id}>{organizer.name}</option>)}
              </select>
            </div>
            <div className="mb-4">
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Category</label>
              <select value={form.category} onChange={set("category")} className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm">
                {CATEGORIES.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
              </select>
            </div>
            <div className="mb-4">
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Event type</label>
              <select value={form.eventType} onChange={set("eventType")} className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm">
                <option value="in-person">In-person</option>
                <option value="online">Online</option>
              </select>
            </div>
            <TextField label="Date" type="date" value={form.date} onChange={set("date")} min={TODAY_STR} required />
            <TextField label="Price (SZL)" type="number" value={form.price} onChange={set("price")} min="0" step="0.01" required />
            <TextField label="Start time" type="time" value={form.startTime} onChange={set("startTime")} required />
            <TextField label="End time" type="time" value={form.endTime} onChange={set("endTime")} required />
          </div>
          <div className="mb-4">
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Description</label>
            <textarea value={form.description} onChange={set("description")} minLength={20} maxLength={10000} rows={4} className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm" required />
          </div>
          {form.eventType === "online" ? (
            <TextField label="Online event URL (HTTPS)" type="url" value={form.onlineUrl} onChange={set("onlineUrl")} required />
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                <TextField label="Venue" value={form.venue} onChange={set("venue")} required />
                <TextField label="Address" value={form.address} onChange={set("address")} />
                <div className="mb-4">
                  <label className="text-xs font-semibold text-slate-600 block mb-1.5">City</label>
                  <select value={form.city} onChange={set("city")} className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm">
                    {LOCATIONS.map((city) => <option key={city}>{city}</option>)}
                  </select>
                </div>
                <TextField label="Country" value={form.country} onChange={set("country")} required />
              </div>
            </>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <TextField label="Ticket URL (optional)" type="url" value={form.ticketUrl} onChange={set("ticketUrl")} />
            <TextField label="Contact email (optional)" type="email" value={form.contactEmail} onChange={set("contactEmail")} />
          </div>
          {error && <p role="alert" className="text-sm text-rose-600 mb-3">{error}</p>}
          <button disabled={busy || !organizers.length} className="bg-slate-900 text-white font-semibold text-sm px-4 py-2.5 rounded-full disabled:opacity-60">
            {busy ? "Adding..." : "Add and publish event"}
          </button>
          <p className="text-xs text-slate-500 mt-2">Administrator-created events are published immediately and ordered by event date unless sponsored.</p>
        </form>
      )}
    </section>
  );
}

function AdminEventsList({ events, organizers, onApprove, onReject, onDelete, onFeature, filterStatus }) {
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const orgById = (id) => organizers.find((o) => o.id === id);
  async function runAction(action, event) {
    setError("");
    try {
      await action(event);
    } catch (cause) {
      setError(cause.message || "Could not update this event.");
    }
  }
  let list = events;
  if (filterStatus) list = list.filter((e) => e.status === filterStatus);
  if (q) list = list.filter((e) => e.title.toLowerCase().includes(q.toLowerCase()));
  list = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  return (
    <div>
      <div className="flex items-center gap-2 bg-stone-100 rounded-full px-4 h-10 mb-4 max-w-sm">
        <Search size={14} className="text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events..." className="bg-transparent text-sm outline-none w-full" />
      </div>
      {error && <p role="alert" className="text-sm text-rose-600 mb-3">{error}</p>}
      {list.length === 0 ? <EmptyState title="No events here" /> : (
        <div className="flex flex-col gap-2">
          {list.map((e) => <AdminEventRow key={e.id} e={e} organizer={orgById(e.organizerId)} onApprove={(event) => runAction(onApprove, event)} onReject={(event) => runAction(onReject, event)} onDelete={(event) => runAction(onDelete, event)} onFeature={(event) => runAction(onFeature, event)} />)}
        </div>
      )}
    </div>
  );
}

function AdminUserPasswordReset({ user, onResetPassword }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    const passwordError = validateNewPassword(password, confirmation);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    try {
      const result = await onResetPassword(user.id, password);
      if (result) {
        setError(result);
        return;
      }
      setPassword("");
      setConfirmation("");
      setOpen(false);
    } catch (cause) {
      setError(cause.message || "Could not update that user's password.");
    }
  }

  return (
    <div className="shrink-0">
      {open ? (
        <form onSubmit={submit} className="mt-3 border-t border-stone-100 pt-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <TextField label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} autoComplete="new-password" required />
            <TextField label="Confirm password" type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} minLength={12} autoComplete="new-password" required />
          </div>
          {error && <p role="alert" className="text-sm text-rose-600 mb-3">{error}</p>}
          <div className="flex gap-2">
            <button className="bg-slate-900 text-white font-semibold text-sm px-4 py-2 rounded-full">Set password</button>
            <button type="button" onClick={() => { setOpen(false); setError(""); }} className="border border-stone-200 text-slate-600 font-semibold text-sm px-4 py-2 rounded-full">Cancel</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setOpen(true)} className="border border-violet-200 text-violet-700 font-semibold text-xs px-3 py-2 rounded-full hover:bg-violet-50">
          Set password
        </button>
      )}
    </div>
  );
}

function AdminUsers({ users, currentUser, onResetPassword }) {
  return (
    <div>
      <h2 className="font-display text-xl font-extrabold text-slate-900 mb-4">Users ({users.length})</h2>
      <p className="text-xs text-slate-600 bg-slate-50 rounded-xl p-3 mb-4">Password resets are processed by the server and recorded in the administrator audit log.</p>
      <div className="flex flex-col gap-2">
        {users.map((u) => (
          <div key={u.id} className="border border-stone-200 rounded-xl p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-950 text-amber-300 flex items-center justify-center font-bold text-sm shrink-0">{u.name.charAt(0)}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 text-sm truncate">{u.name}</div>
                <div className="text-xs text-slate-400 truncate">{u.createdAt ? `Joined ${formatDateShort(u.createdAt.slice(0, 10))}` : "Account"}</div>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 capitalize">{u.role}</span>
              {u.id === currentUser.id ? (
                <span className="text-xs text-slate-400 hidden sm:inline">Change yours in your profile</span>
              ) : (
                <AdminUserPasswordReset user={u} onResetPassword={onResetPassword} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminHostApplications({ applications, onReview }) {
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function review(application, approved) {
    setBusyId(application.id);
    setError("");
    try {
      await onReview(application, approved);
    } catch (cause) {
      setError(cause.message || "Could not review this application.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div>
      <h2 className="font-display text-xl font-extrabold text-slate-900 mb-4">Host applications ({applications.length})</h2>
      {error && <p role="alert" className="text-sm text-rose-600 mb-3">{error}</p>}
      {applications.length === 0 ? <EmptyState icon={Building2} title="No pending host applications" /> : (
        <div className="flex flex-col gap-3">
          {applications.map((application) => (
            <article key={application.id} className="border border-stone-200 rounded-xl p-4">
              <div className="font-bold text-slate-900">{application.organization_name}</div>
              <div className="text-xs text-slate-500 mt-1">{application.profiles?.full_name} · {application.location}</div>
              <p className="text-sm text-slate-700 my-3 whitespace-pre-line">{application.description}</p>
              {application.website && <a href={application.website} target="_blank" rel="noreferrer" className="text-sm text-violet-700 underline">{application.website}</a>}
              <div className="flex gap-2 mt-4">
                <button disabled={Boolean(busyId)} onClick={() => review(application, true)} className="bg-emerald-600 disabled:opacity-60 text-white font-semibold text-sm px-4 py-2 rounded-full">{busyId === application.id ? "Saving..." : "Approve host"}</button>
                <button disabled={Boolean(busyId)} onClick={() => review(application, false)} className="border border-rose-200 disabled:opacity-60 text-rose-700 font-semibold text-sm px-4 py-2 rounded-full">Reject</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminOrganizers({ organizers, events }) {
  return (
    <div>
      <h2 className="font-display text-xl font-extrabold text-slate-900 mb-4">Organizers ({organizers.length})</h2>
      <div className="flex flex-col gap-2">
        {organizers.map((o) => (
          <div key={o.id} className="flex items-center gap-3 border border-stone-200 rounded-xl p-3">
            <img src={imgUrl(o.logoSeed, 100, 100)} className="w-10 h-10 rounded-full object-cover shrink-0" alt="" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-800 text-sm truncate">{o.name}</div>
              <div className="text-xs text-slate-400 truncate">{o.location}</div>
            </div>
            <span className="text-xs font-semibold text-slate-500 shrink-0">{events.filter((e) => e.organizerId === o.id).length} events</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminCategories({ events }) {
  return (
    <div>
      <h2 className="font-display text-xl font-extrabold text-slate-900 mb-4">Categories ({CATEGORIES.length})</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {CATEGORIES.map((c) => (
          <div key={c.slug} className="flex items-center gap-2.5 border border-stone-200 rounded-xl p-3">
            <c.icon size={16} className="text-violet-600 shrink-0" />
            <span className="text-sm font-semibold text-slate-700 flex-1 truncate">{c.name}</span>
            <span className="text-xs text-slate-400">{events.filter((e) => e.categorySlug === c.slug).length}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-4">Category changes are managed through reviewed database migrations.</p>
    </div>
  );
}

function AdminLocations({ events }) {
  return (
    <div>
      <h2 className="font-display text-xl font-extrabold text-slate-900 mb-4">Locations ({LOCATIONS.length})</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {LOCATIONS.map((l) => (
          <div key={l} className="flex items-center gap-2.5 border border-stone-200 rounded-xl p-3">
            <MapPin size={16} className="text-rose-500 shrink-0" />
            <span className="text-sm font-semibold text-slate-700 flex-1 truncate">{l}</span>
            <span className="text-xs text-slate-400">{events.filter((e) => e.city === l).length}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-4">Eswatini ships with these locations; new cities and countries can be added as SHOW UP expands.</p>
    </div>
  );
}

function AdminAds({ events, payments, onRecordPayment, onVoidPayment }) {
  const eligibleEvents = events.filter((event) =>
    isUpcomingApproved(event) && eventStartIsFuture(event),
  );
  const [form, setForm] = useState({ eventId: "", payerName: "", amount: "", paymentReference: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onRecordPayment({
        eventId: form.eventId,
        payerName: form.payerName.trim(),
        amount: Number(form.amount),
        paymentReference: form.paymentReference.trim(),
      });
      setForm({ eventId: "", payerName: "", amount: "", paymentReference: "" });
    } catch (cause) {
      setError(cause.message || "Could not confirm this ad payment.");
    } finally {
      setBusy(false);
    }
  }

  async function voidPayment(payment) {
    setError("");
    try {
      await onVoidPayment(payment);
    } catch (cause) {
      setError(cause.message || "Could not void this ad payment.");
    }
  }

  const paidTotals = new Map();
  for (const payment of payments) {
    if (!payment.voided_at && payment.event_id) {
      paidTotals.set(payment.event_id, (paidTotals.get(payment.event_id) || 0) + Number(payment.amount));
    }
  }
  const rankedEvents = events.filter((event) => event.sponsoredRank)
    .sort((a, b) => a.sponsoredRank - b.sponsoredRank);

  return (
    <div>
      <h2 className="font-display text-xl font-extrabold text-slate-900 mb-1">Event advertising</h2>
      <p className="text-sm text-slate-500 mb-5">Only confirm payments already received. Active sponsored events rank by their total confirmed payment and stop being promoted at start time.</p>
      <form onSubmit={submit} className="bg-white border border-stone-200 rounded-2xl p-4 mb-6">
        <h3 className="font-bold text-slate-900 mb-3">Confirm received payment</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="mb-4">
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Approved upcoming event</label>
            <select value={form.eventId} onChange={(event) => setForm((previous) => ({ ...previous, eventId: event.target.value }))} className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm" required>
              <option value="">Choose event</option>
              {eligibleEvents.map((event) => <option key={event.id} value={event.id}>{event.title} · {formatDateShort(event.date)}</option>)}
            </select>
            {!eligibleEvents.length && <p className="text-xs text-slate-500 mt-1">There are no approved upcoming events to promote.</p>}
          </div>
          <TextField label="Payer name" value={form.payerName} onChange={(event) => setForm((previous) => ({ ...previous, payerName: event.target.value }))} minLength={2} maxLength={160} required />
          <TextField label="Amount received (SZL)" type="number" value={form.amount} onChange={(event) => setForm((previous) => ({ ...previous, amount: event.target.value }))} min="0.01" step="0.01" required />
          <TextField label="Payment reference (optional)" value={form.paymentReference} onChange={(event) => setForm((previous) => ({ ...previous, paymentReference: event.target.value }))} maxLength={200} />
        </div>
        {error && <p role="alert" className="text-sm text-rose-600 mb-3">{error}</p>}
        <button disabled={busy || !eligibleEvents.length} className="bg-indigo-950 text-white font-semibold text-sm px-4 py-2.5 rounded-full disabled:opacity-60">
          {busy ? "Recording..." : "Confirm payment"}
        </button>
      </form>

      <section className="mb-6">
        <h3 className="font-bold text-slate-900 mb-3">Current sponsored ranking</h3>
        {!rankedEvents.length ? <p className="text-sm text-slate-500">No active paid promotions.</p> : (
          <ol className="space-y-2">
            {rankedEvents.map((event) => (
              <li key={event.id} className="flex items-center gap-3 border border-stone-200 rounded-xl p-3">
                <span className="w-8 h-8 rounded-full bg-indigo-950 text-white flex items-center justify-center font-bold text-sm">{event.sponsoredRank}</span>
                <span className="flex-1 min-w-0 text-sm font-semibold text-slate-800 truncate">{event.title}</span>
                <span className="text-sm font-bold text-emerald-700">SZL {Number(paidTotals.get(event.id) || 0).toFixed(2)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h3 className="font-bold text-slate-900 mb-3">Payment records ({payments.length})</h3>
        {!payments.length ? <p className="text-sm text-slate-500">No ad payments have been recorded.</p> : (
          <div className="space-y-2">
            {payments.map((payment) => (
              <div key={payment.id} className={`border rounded-xl p-3 ${payment.voided_at ? "border-stone-200 bg-stone-50 opacity-70" : "border-stone-200 bg-white"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 min-w-[12rem] text-sm font-semibold text-slate-800">{payment.event_title}</span>
                  <span className="text-sm font-bold text-slate-900">SZL {Number(payment.amount).toFixed(2)}</span>
                  <span className={`text-xs font-semibold ${payment.voided_at ? "text-rose-600" : "text-emerald-700"}`}>{payment.voided_at ? "Voided" : "Confirmed"}</span>
                  {!payment.voided_at && <button onClick={() => voidPayment(payment)} className="text-xs font-semibold text-rose-700 hover:underline">Void record</button>}
                </div>
                <p className="text-xs text-slate-500 mt-1">{payment.payer_name} · {formatDateShort(payment.confirmed_at.slice(0, 10))}{payment.payment_reference ? ` · Ref: ${payment.payment_reference}` : ""}</p>
                {payment.void_reason && <p className="text-xs text-rose-600 mt-1">Reason: {payment.void_reason}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AdminPanel({ tab, setTab, events, organizers, users, currentUser, hostApplications, adPayments, onApprove, onReject, onDelete, onFeature, onResetPassword, onReviewHostApplication, onCreateAdminEvent, onRecordAdPayment, onVoidAdPayment }) {
  return (
    <AdminShell tab={tab} setTab={setTab}>
      {tab === "dashboard" && <AdminDashboardHome events={events} users={users} organizers={organizers} />}
      {tab === "events" && <><AdminEventCreateForm organizers={organizers} onCreate={onCreateAdminEvent} /><AdminEventsList events={events} organizers={organizers} onApprove={onApprove} onReject={onReject} onDelete={onDelete} onFeature={onFeature} /></>}
      {tab === "pending" && <AdminEventsList events={events} organizers={organizers} onApprove={onApprove} onReject={onReject} onDelete={onDelete} onFeature={onFeature} filterStatus="pending" />}
      {tab === "hosts" && <AdminHostApplications applications={hostApplications} onReview={onReviewHostApplication} />}
      {tab === "users" && <AdminUsers users={users} currentUser={currentUser} onResetPassword={onResetPassword} />}
      {tab === "organizers" && <AdminOrganizers organizers={organizers} events={events} />}
      {tab === "categories" && <AdminCategories events={events} />}
      {tab === "locations" && <AdminLocations events={events} />}
      {tab === "featured" && <AdminEventsList events={events.filter((e) => e.featured)} organizers={organizers} onApprove={onApprove} onReject={onReject} onDelete={onDelete} onFeature={onFeature} />}
      {tab === "ads" && <AdminAds events={events} payments={adPayments} onRecordPayment={onRecordAdPayment} onVoidPayment={onVoidAdPayment} />}
    </AdminShell>
  );
}

/* ============================================================================
   APP ROOT
============================================================================ */
export default function App() {
  const [events, setEvents] = useState(SEED_EVENTS);
  const [organizers, setOrganizers] = useState(SEED_ORGANIZERS);
  const [users, setUsers] = useState([]);
  const [hostApplications, setHostApplications] = useState([]);
  const [adPayments, setAdPayments] = useState([]);
  const [savedEvents, setSavedEvents] = useState([]);
  const [followed, setFollowed] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [backendStatus, setBackendStatus] = useState(isBackendConfigured ? "loading" : "unconfigured");
  const [backendError, setBackendError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });

  const [view, setView] = useState(routeFromLocation);
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("Eswatini");
  const [filters, setFilters] = useState({ category: "", city: "", free: false, type: "", when: "" });
  const [toastMsg, setToastMsg] = useState("");
  const [adminTab, setAdminTab] = useState("dashboard");

  useEffect(() => {
    if (!isBackendConfigured) return;
    let active = true;
    async function loadPlatform() {
      try {
        const isRecovery = restoreRecoverySessionFromUrl();
        if (isRecovery && active) setView({ page: "password-recovery", params: {} });
        const [profile, eventRows, organizerRows] = await Promise.all([
          getCurrentProfile(),
          listApprovedEvents(),
          listPublicOrganizers(),
        ]);
        if (!active) return;
        setCurrentUser(profile);
        setEvents(eventRows.map(eventFromRecord));
        setOrganizers(organizerRows.map(organizerFromRecord));
        if (profile) {
          const [savedRows, followedRows, attendanceRows] = await Promise.all([
            listSavedEventIds(),
            listFollowedOrganizerIds(),
            listMyAttendance(),
          ]);
          if (!active) return;
          setSavedEvents(savedRows.map((row) => ({
            id: `${profile.id}:${row.event_id}`,
            userId: profile.id,
            eventId: row.event_id,
          })));
          setFollowed(followedRows.map((row) => ({
            id: `${profile.id}:${row.organizer_id}`,
            userId: profile.id,
            organizerId: row.organizer_id,
          })));
          setAttendance(attendanceRows.map((row) => ({
            eventId: row.event_id,
            status: row.status,
          })));
        }
        setBackendStatus("ready");
      } catch (cause) {
        if (!active) return;
        setBackendError(cause.message || "Could not load the platform.");
        setBackendStatus("error");
      }
    }
    loadPlatform();
    return () => { active = false; };
  }, [loadAttempt]);

  useEffect(() => {
    if (currentUser?.role !== "admin") {
      setUsers([]);
      setHostApplications([]);
      setAdPayments([]);
      return;
    }
    let active = true;
    Promise.all([listUsers(), listHostApplications(), listAdminEvents(), listEventAdPayments()])
      .then(([profiles, applications, adminEvents, payments]) => {
        if (!active) return;
        setUsers(profiles.map((profile) => ({
          id: profile.id,
          name: profile.full_name,
          email: "",
          role: profile.role,
          createdAt: profile.created_at,
        })));
        setHostApplications(applications);
        setEvents(adminEvents.map(eventFromRecord));
        setAdPayments(payments);
      })
      .catch((cause) => {
        if (active) toast(cause.message || "Could not load admin data.");
      });
    return () => { active = false; };
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    const handlePopState = () => setView(routeFromLocation());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const nav = (page, params = {}) => {
    if (page === "events" && Object.keys(params).length) {
      setFilters((f) => ({ category: "", city: "", free: false, type: "", when: "", ...params }));
    }
    setView({ page, params });
    const nextPath = routePath(page, params);
    if (window.location.pathname !== nextPath) window.history.pushState({}, "", nextPath);
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  };

  const toast = (msg) => {
    setToastMsg(msg);
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => setToastMsg(""), 2200);
  };

  const savedIds = useMemo(() => new Set(savedEvents.filter((s) => s.userId === currentUser?.id).map((s) => s.eventId)), [savedEvents, currentUser]);
  const followedIds = useMemo(() => new Set(followed.filter((f) => f.userId === currentUser?.id).map((f) => f.organizerId)), [followed, currentUser]);

  async function loadUserRelations(userId) {
    const [savedRows, followedRows, attendanceRows] = await Promise.all([
      listSavedEventIds(),
      listFollowedOrganizerIds(),
      listMyAttendance(),
    ]);
    setSavedEvents(savedRows.map((row) => ({
      id: `${userId}:${row.event_id}`,
      userId,
      eventId: row.event_id,
    })));
    setFollowed(followedRows.map((row) => ({
      id: `${userId}:${row.organizer_id}`,
      userId,
      organizerId: row.organizer_id,
    })));
    setAttendance(attendanceRows.map((row) => ({
      eventId: row.event_id,
      status: row.status,
    })));
  }

  async function toggleSave(event) {
    if (!currentUser) { toast("Log in to save events"); nav("login"); return; }
    try {
      const exists = savedIds.has(event.id);
      if (exists) {
        await unsaveEvent(event.id);
        setSavedEvents((prev) => prev.filter((s) => !(s.userId === currentUser.id && s.eventId === event.id)));
        toast("Removed from saved");
      } else {
        await saveEvent(event.id);
        setSavedEvents((prev) => [...prev, { id: `${currentUser.id}:${event.id}`, userId: currentUser.id, eventId: event.id }]);
        toast("Saved to your list");
      }
    } catch (cause) {
      toast(cause.message || "Could not update saved events.");
    }
  }

  async function toggleFollow(organizer) {
    if (!currentUser) { toast("Log in to follow organizers"); nav("login"); return; }
    try {
      const exists = followedIds.has(organizer.id);
      if (exists) {
        await unfollowOrganizer(organizer.id);
        setFollowed((prev) => prev.filter((f) => !(f.userId === currentUser.id && f.organizerId === organizer.id)));
        toast(`Unfollowed ${organizer.name}`);
      } else {
        await followOrganizer(organizer.id);
        setFollowed((prev) => [...prev, { id: `${currentUser.id}:${organizer.id}`, userId: currentUser.id, organizerId: organizer.id }]);
        toast(`Following ${organizer.name}`);
      }
    } catch (cause) {
      toast(cause.message || "Could not update your followed organizers.");
    }
  }

  async function toggleAttendance(event) {
    if (!currentUser) { toast("Log in to RSVP for events"); nav("login"); return; }
    const existing = attendance.find((row) => row.eventId === event.id);
    if (existing?.status === "attended") {
      toast("Your attendance has already been verified.");
      return;
    }
    const nextStatus = existing?.status === "going" ? "cancelled" : "going";
    try {
      await setEventAttendance(event.id, currentUser.id, nextStatus);
      setAttendance((prev) => [
        ...prev.filter((row) => row.eventId !== event.id),
        { eventId: event.id, status: nextStatus },
      ]);
      setEvents((prev) => prev.map((item) => item.id === event.id ? {
        ...item,
        attendeeCount: Math.max(0, (item.attendeeCount || 0) + (nextStatus === "going" ? 1 : -1)),
      } : item));
      toast(nextStatus === "going" ? "You’re on the attendee list" : "Your RSVP was cancelled");
    } catch (cause) {
      toast(cause.message || "Could not update your RSVP.");
    }
  }

  async function handleSubmitRating(eventId, rating, review) {
    await submitEventRating(eventId, rating, review);
    const refreshed = currentUser?.role === "admin"
      ? await listAdminEvents()
      : await listApprovedEvents();
    setEvents(refreshed.map(eventFromRecord));
    toast("Rating saved");
  }

  function openEvent(event) { nav("event", { slug: event.slug }); }
  function openOrganizer(organizer) { nav("organizer", { slug: slugify(organizer.name) }); }

  async function handleLogin(email, password) {
    await signIn(email.trim(), password);
    const u = await getCurrentProfile();
    if (!u) throw new Error("Your account profile is missing. Contact support.");
    setCurrentUser(u);
    await loadUserRelations(u.id);
    toast(`Welcome back, ${u.name.split(" ")[0]}`);
    nav(u.role === "admin" ? "admin" : "home");
    return null;
  }
  async function handleLogout() {
    try {
      await signOut();
      setCurrentUser(null);
      setSavedEvents([]);
      setFollowed([]);
      setAttendance([]);
      toast("Logged out");
      nav("home");
    } catch (cause) {
      toast(cause.message || "Could not log out.");
    }
  }
  async function handleSignup(name, email, password, confirmation) {
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    if (!cleanName || !cleanEmail) return { error: "Please enter your name and email." };
    const passwordError = validateNewPassword(password, confirmation);
    if (passwordError) return { error: passwordError };
    const result = await signUp(cleanEmail, password, cleanName);
    if (!result.access_token) {
      return { message: "Check your email to verify your account, then log in to continue." };
    }
    const u = await getCurrentProfile();
    if (!u) throw new Error("Your account was created, but its profile is not ready. Contact support.");
    setCurrentUser(u);
    await loadUserRelations(u.id);
    toast("Account created");
    nav("home");
    return null;
  }
  async function handleChangePassword(currentPassword, newPassword) {
    if (!currentUser?.email) return "Please log in and try again.";
    if (newPassword === currentPassword) return "Choose a password different from your current one.";
    await changeAccountPassword(currentUser.email, currentPassword, newPassword);
    toast("Password changed");
    return null;
  }
  async function handleRecoveryPassword(password) {
    await setRecoveryPassword(password);
    await signOut();
    setCurrentUser(null);
    setSavedEvents([]);
    setFollowed([]);
    setAttendance([]);
    toast("Password reset successfully");
  }
  async function handleAdminPasswordReset(userId, password) {
    if (currentUser?.role !== "admin") return "Only admins can set another user's password.";
    if (userId === currentUser.id) return "Change your own password from your profile.";
    if (!users.some((u) => u.id === userId)) return "That user account could not be found.";
    await setAnotherUserPassword(userId, password);
    toast("User password updated");
    return null;
  }

  async function handleSubmitEvent(form, imageFile) {
    const organizer = organizers.find((item) => item.userId === currentUser?.id);
    if (!organizer) throw new Error("An approved host account is required before you can publish an event.");
    const slug = `${slugify(form.title)}-${Date.now().toString(36)}`;
    const imagePath = imageFile ? await uploadEventImage(imageFile) : null;
    const record = await createEvent({
      organizer_id: organizer.id,
      title: form.title.trim(),
      slug,
      description: form.description.trim(),
      category_slug: form.category,
      event_type: form.eventType,
      event_date: form.date,
      start_time: form.startTime,
      end_time: form.endTime,
      venue: form.eventType === "online" ? null : form.venue.trim(),
      address: form.eventType === "online" ? null : form.address.trim(),
      city: form.eventType === "online" ? "Online" : form.city,
      country: form.country.trim(),
      price: Number(form.price) || 0,
      ticket_url: form.ticketUrl.trim() || null,
      online_url: form.eventType === "online" ? form.onlineUrl.trim() : null,
      contact_email: form.contactEmail.trim() || null,
      image_path: imagePath,
    });
    setEvents((prev) => [eventFromRecord(record[0]), ...prev]);
    toast("Event submitted for admin review");
  }

  async function handleHostApplication(form) {
    if (!currentUser) throw new Error("Please log in to apply to host events.");
    await submitHostApplication({
      user_id: currentUser.id,
      organization_name: form.organizationName.trim(),
      description: form.description.trim(),
      location: form.location.trim(),
      website: form.website.trim() || null,
      contact_phone: form.phone.trim() || null,
    });
    toast("Host application submitted for review");
  }

  async function handleReviewHostApplication(application, approved) {
    await approveHostApplication(application.id, approved);
    setHostApplications((prev) => prev.filter((item) => item.id !== application.id));
    if (approved) {
      setOrganizers((await listPublicOrganizers()).map(organizerFromRecord));
      setUsers((prev) => prev.map((user) => user.id === application.user_id ? { ...user, role: "organizer" } : user));
    }
    toast(approved ? "Host application approved" : "Host application rejected");
  }

  async function adminApprove(e) {
    await updateEvent(e.id, { status: "approved", reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() });
    setEvents((prev) => prev.map((x) => x.id === e.id ? { ...x, status: "approved" } : x));
    toast("Event approved and published");
  }
  async function adminReject(e) {
    await updateEvent(e.id, { status: "rejected", reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() });
    setEvents((prev) => prev.map((x) => x.id === e.id ? { ...x, status: "rejected" } : x));
    toast("Event rejected");
  }
  async function adminDelete(e) {
    await deleteEvent(e.id);
    setEvents((prev) => prev.filter((x) => x.id !== e.id));
    toast("Event deleted");
  }
  async function adminFeature(e) {
    await updateEvent(e.id, { featured: !e.featured });
    setEvents((prev) => prev.map((x) => x.id === e.id ? { ...x, featured: !e.featured } : x));
    toast(e.featured ? "Removed from featured" : "Marked as featured");
  }

  async function adminCreateEvent(form) {
    if (currentUser?.role !== "admin") throw new Error("Only administrators can add events.");
    const organizer = organizers.find((item) => item.id === form.organizerId);
    if (!organizer) throw new Error("Choose an approved organizer.");
    if (form.endTime <= form.startTime) throw new Error("The end time must be after the start time.");
    if (!eventStartIsFuture({ date: form.date, startTime: form.startTime })) throw new Error("Choose a future event date and time.");
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) throw new Error("Enter a valid event price.");

    const created = await createEvent({
      organizer_id: organizer.id,
      title: form.title.trim(),
      slug: `${slugify(form.title)}-${Date.now().toString(36)}`,
      description: form.description.trim(),
      category_slug: form.category,
      event_type: form.eventType,
      event_date: form.date,
      start_time: form.startTime,
      end_time: form.endTime,
      venue: form.eventType === "online" ? null : form.venue.trim(),
      address: form.eventType === "online" ? null : form.address.trim() || null,
      city: form.eventType === "online" ? "Online" : form.city,
      country: form.country.trim(),
      price,
      ticket_url: form.ticketUrl.trim() || null,
      online_url: form.eventType === "online" ? form.onlineUrl.trim() : null,
      contact_email: form.contactEmail.trim() || null,
      image_path: null,
      status: "approved",
      reviewed_by: currentUser.id,
      reviewed_at: new Date().toISOString(),
    });
    if (!created?.[0]) throw new Error("The event was saved but could not be loaded.");
    setEvents((previous) => [...previous, eventFromRecord(created[0])]);
    toast("Event added and published");
  }
  async function refreshAdminAds() {
    const [adminEvents, payments] = await Promise.all([listAdminEvents(), listEventAdPayments()]);
    setEvents(adminEvents.map(eventFromRecord));
    setAdPayments(payments);
  }
  async function adminRecordAdPayment(payment) {
    if (currentUser?.role !== "admin") throw new Error("Only administrators can confirm ad payments.");
    const event = events.find((item) => item.id === payment.eventId);
    if (!event || !isUpcomingApproved(event) || !eventStartIsFuture(event)) throw new Error("Choose an approved upcoming event.");
    await recordEventAdPayment({
      event_id: event.id,
      event_title: event.title,
      payer_name: payment.payerName,
      amount: payment.amount,
      payment_reference: payment.paymentReference || null,
    });
    await refreshAdminAds();
    toast("Ad payment confirmed and event ranking updated");
  }
  async function adminVoidAdPayment(payment) {
    const reason = window.prompt(`Why are you voiding the payment for "${payment.event_title}"?`);
    if (!reason?.trim()) return;
    await voidEventAdPayment(payment.id, reason.trim());
    await refreshAdminAds();
    toast("Ad payment voided and event ranking updated");
  }

  useEffect(() => {
    if ((view.page === "admin") && currentUser?.role !== "admin") {
      // guard: non-admins can't view admin
    }
  }, [view.page, currentUser]);

  const eventBySlug = (slug) => events.find((e) => e.slug === slug);
  const organizerBySlug = (slug) => organizers.find((o) => slugify(o.name) === slug);

  let content;
  if (view.page === "home") {
    content = <HomePage nav={nav} events={events} organizers={organizers} savedIds={savedIds} toggleSave={toggleSave} openEvent={openEvent} search={search} setSearch={setSearch} location={location} setLocation={setLocation} />;
  } else if (view.page === "events") {
    content = <EventsPage nav={nav} events={events} organizers={organizers} savedIds={savedIds} toggleSave={toggleSave} openEvent={openEvent} search={search} setSearch={setSearch} filters={filters} setFilters={setFilters} />;
  } else if (view.page === "event") {
    const e = eventBySlug(view.params.slug);
    const organizer = e && organizers.find((o) => o.id === e.organizerId);
    const related = e ? events.filter((x) => x.id !== e.id && x.categorySlug === e.categorySlug && isUpcomingApproved(x)).slice(0, 3) : [];
    const userAttendance = attendance.find((row) => row.eventId === e?.id)?.status || null;
    content = <EventDetailPage event={e} organizer={organizer} nav={nav} savedIds={savedIds} toggleSave={toggleSave} toast={toast} related={related} openEvent={openEvent} openOrganizer={openOrganizer} attendanceStatus={userAttendance} canRate={userAttendance === "attended"} onToggleAttendance={toggleAttendance} onSubmitRating={handleSubmitRating} />;
  } else if (view.page === "organizer") {
    const o = organizerBySlug(view.params.slug);
    content = <OrganizerPage organizer={o} events={events} nav={nav} savedIds={savedIds} toggleSave={toggleSave} openEvent={openEvent} isFollowing={o ? followedIds.has(o.id) : false} onToggleFollow={() => o && toggleFollow(o)} />;
  } else if (view.page === "submit") {
    const existingOrganizer = currentUser ? organizers.find((o) => o.userId === currentUser.id) : null;
    content = <SubmitEventPage currentUser={currentUser} nav={nav} onSubmitEvent={handleSubmitEvent} existingOrganizer={existingOrganizer} />;
  } else if (view.page === "login") {
    content = <LoginPage nav={nav} onLogin={handleLogin} />;
  } else if (view.page === "forgot-password") {
    content = <ForgotPasswordPage nav={nav} />;
  } else if (view.page === "password-recovery") {
    content = <PasswordRecoveryPage nav={nav} onReset={handleRecoveryPassword} />;
  } else if (view.page === "signup") {
    content = <SignupPage nav={nav} onSignup={handleSignup} />;
  } else if (view.page === "host") {
    content = <HostApplicationPage currentUser={currentUser} nav={nav} onSubmit={handleHostApplication} />;
  } else if (view.page === "saved") {
    content = <SavedPage events={events} organizers={organizers} savedIds={savedIds} toggleSave={toggleSave} openEvent={openEvent} nav={nav} currentUser={currentUser} />;
  } else if (view.page === "profile") {
    content = <ProfilePage currentUser={currentUser} events={events} organizers={organizers} followedIds={followedIds} nav={nav} onLogout={handleLogout} onChangePassword={handleChangePassword} />;
  } else if (view.page === "admin") {
    if (currentUser?.role !== "admin") {
      content = <EmptyState icon={ShieldCheck} title="Admin access only" sub="Log in with an admin account to view this page." />;
    } else {
      content = <AdminPanel tab={adminTab} setTab={setAdminTab} events={events} organizers={organizers} users={users} currentUser={currentUser} hostApplications={hostApplications} adPayments={adPayments} onApprove={adminApprove} onReject={adminReject} onDelete={adminDelete} onFeature={adminFeature} onResetPassword={handleAdminPasswordReset} onReviewHostApplication={handleReviewHostApplication} onCreateAdminEvent={adminCreateEvent} onRecordAdPayment={adminRecordAdPayment} onVoidAdPayment={adminVoidAdPayment} />;
    }
  }

  if (backendStatus === "unconfigured") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-stone-50">
        <div className="max-w-xl bg-white border border-stone-200 rounded-2xl p-8">
          <h1 className="font-display text-2xl font-extrabold text-slate-900 mb-3">Platform setup required</h1>
          <p className="text-slate-600">Configure <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> using the project’s local environment file, apply the Supabase migration, then reload.</p>
        </div>
      </div>
    );
  }
  if (backendStatus === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-slate-600">Connecting to SHOW UP…</div>;
  }
  if (backendStatus === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-stone-50">
        <div className="max-w-xl bg-white border border-rose-200 rounded-2xl p-8">
          <h1 className="font-display text-2xl font-extrabold text-slate-900 mb-3">Could not connect to SHOW UP</h1>
          <p role="alert" className="text-rose-700 mb-5">{backendError}</p>
          <button onClick={() => { setBackendStatus("loading"); setBackendError(""); setLoadAttempt((attempt) => attempt + 1); }} className="bg-slate-900 text-white font-bold px-5 py-2.5 rounded-full">Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans transition-colors duration-300 ${darkMode ? 'dark bg-slate-950 text-white' : 'bg-white'}`} style={{ fontFamily: "'Inter', ui-sans-serif, system-ui" }}>
      <style>{`
        .font-display { font-family: 'Space Grotesk', ui-sans-serif, system-ui; }
        .font-mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes fadeIn { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      `}</style>

      <Navbar nav={nav} currentUser={currentUser} onLogout={handleLogout} search={search} setSearch={setSearch} onSearchSubmit={() => nav("events")} darkMode={darkMode} setDarkMode={setDarkMode} />
      <main className="pb-20 md:pb-0">{content}</main>
      <Footer nav={nav} />
      <MobileNav page={view.page} nav={nav} />
      <Toast message={toastMsg} />
    </div>
  );
}
