/** Attendance opens on the session day (America/Toronto) and stays open afterwards. */
export function attendanceOpen(startsAt: string | null, now: Date = new Date()): boolean {
  if (!startsAt) return false
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(d)
  return day(now) >= day(new Date(startsAt))
}
