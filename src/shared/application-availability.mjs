export const APPLICATION_AVAILABILITY_COPY =
  "Please select each time slot that you can commit to during a normal week. Please note that you will not be committed to every time slot you select. Selecting a time slot simply states that you are normally available during that time slot and would be able to attend training sessions or operations if they were scheduled during that time slot.";

export const APPLICATION_AVAILABILITY_SLOTS = [
  {
    key: "monday_evenings",
    label: "Monday Evenings (19:00 CST - 23:00 CST)",
  },
  {
    key: "tuesday_evenings",
    label: "Tuesday Evenings (19:00 CST - 23:00 CST)",
  },
  {
    key: "wednesday_evenings",
    label: "Wednesday Evenings (19:00 CST - 23:00 CST)",
  },
  {
    key: "thursday_evenings",
    label: "Thursday Evenings (19:00 CST - 23:00 CST)",
  },
  {
    key: "friday_evenings",
    label: "Friday Evenings (19:00 CST - 23:00 CST)",
  },
  {
    key: "saturday_afternoon",
    label: "Saturday Afternoon (13:00 CST - 18:00 CST)",
  },
  {
    key: "saturday_evenings",
    label: "Saturday Evenings (19:00 CST - 23:00 CST)",
  },
  {
    key: "sunday_afternoon",
    label: "Sunday Afternoon (13:00 CST - 18:00 CST)",
  },
  {
    key: "sunday_evenings",
    label: "Sunday Evenings (19:00 CST - 23:00 CST)",
  },
];

const availabilityLabelMap = new Map(
  APPLICATION_AVAILABILITY_SLOTS.map((slot) => [slot.key, slot.label]),
);

export function applicationAvailabilityLabel(key) {
  return availabilityLabelMap.get(String(key ?? "").trim()) ?? "";
}
