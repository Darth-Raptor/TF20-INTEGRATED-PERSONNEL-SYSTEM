import { humanizeIdentifier } from "./display-labels.mjs";

export const EVENT_TYPE_OPTIONS = [
  { id: "CombatOperation", label: "Combat Operation" },
  { id: "UnitTraining", label: "Unit Training" },
  { id: "QualificationCourse", label: "Qualification Course" },
  { id: "Meeting", label: "Meeting" },
];

export const EVENT_LOCATION_OPTIONS = [
  { id: "UnitServer", label: "Unit Server" },
  { id: "Discord", label: "Discord" },
  { id: "TeamSpeak", label: "Team Speak" },
];

export const EVENT_ATTENDANCE_SCOPE_OPTIONS = [
  { id: "Open", label: "Open Attendance" },
  { id: "UnitOnly", label: "Unit Only Attendance" },
];

const EVENT_TYPE_LABELS = Object.fromEntries(
  EVENT_TYPE_OPTIONS.map((option) => [option.id, option.label]),
);
const EVENT_LOCATION_LABELS = Object.fromEntries(
  EVENT_LOCATION_OPTIONS.map((option) => [option.id, option.label]),
);
const EVENT_ATTENDANCE_SCOPE_LABELS = Object.fromEntries(
  EVENT_ATTENDANCE_SCOPE_OPTIONS.map((option) => [option.id, option.label]),
);

export function eventTypeLabel(value) {
  return EVENT_TYPE_LABELS[value] ?? humanizeIdentifier(value, "Unknown");
}

export function eventLocationLabel(value) {
  return EVENT_LOCATION_LABELS[value] ?? humanizeIdentifier(value, "Unknown");
}

export function eventAttendanceScopeLabel(value) {
  return EVENT_ATTENDANCE_SCOPE_LABELS[value] ?? humanizeIdentifier(value, "Unknown");
}

export function normalizeCalendarMonth(value, fallbackDate = new Date()) {
  const candidate = String(value ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(candidate)) {
    const [year, month] = candidate.split("-").map(Number);
    if (month >= 1 && month <= 12) {
      return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}`;
    }
  }

  return localMonthKey(fallbackDate);
}

export function buildCalendarMonth(monthKey) {
  const normalizedMonth = normalizeCalendarMonth(monthKey);
  const [year, month] = normalizedMonth.split("-").map(Number);
  const firstOfMonth = new Date(year, month - 1, 1, 12, 0, 0, 0);
  const firstVisibleDay = new Date(firstOfMonth);
  firstVisibleDay.setDate(firstVisibleDay.getDate() - firstVisibleDay.getDay());

  const days = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(firstVisibleDay);
    date.setDate(firstVisibleDay.getDate() + index);
    days.push({
      key: localDateKey(date),
      date,
      dayOfMonth: date.getDate(),
      inMonth: date.getMonth() === firstOfMonth.getMonth(),
      isToday: localDateKey(date) === localDateKey(new Date()),
    });
  }

  return {
    monthKey: normalizedMonth,
    label: new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
    }).format(firstOfMonth),
    days,
  };
}

export function previousCalendarMonth(monthKey) {
  const [year, month] = normalizeCalendarMonth(monthKey).split("-").map(Number);
  const date = new Date(year, month - 2, 1, 12, 0, 0, 0);
  return localMonthKey(date);
}

export function nextCalendarMonth(monthKey) {
  const [year, month] = normalizeCalendarMonth(monthKey).split("-").map(Number);
  const date = new Date(year, month, 1, 12, 0, 0, 0);
  return localMonthKey(date);
}

export function eventDateKeys(startAt, endsAt = startAt) {
  const start = normalizeDate(startAt);
  const end = normalizeDate(endsAt ?? startAt);
  if (!start || !end) {
    return [];
  }

  const first = stripToLocalDay(start);
  const last = stripToLocalDay(end >= start ? end : start);
  const keys = [];
  const cursor = new Date(first);

  while (cursor <= last) {
    keys.push(localDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

export function localDateKey(value) {
  const date = normalizeDate(value) ?? new Date();
  return [
    date.getFullYear().toString().padStart(4, "0"),
    (date.getMonth() + 1).toString().padStart(2, "0"),
    date.getDate().toString().padStart(2, "0"),
  ].join("-");
}

export function localMonthKey(value = new Date()) {
  const date = normalizeDate(value) ?? new Date();
  return [
    date.getFullYear().toString().padStart(4, "0"),
    (date.getMonth() + 1).toString().padStart(2, "0"),
  ].join("-");
}

function stripToLocalDay(value) {
  const date = normalizeDate(value) ?? new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

function normalizeDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
