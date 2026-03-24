export function enumerateCalendarDates(start: string, end: string): string[] {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    const fallback = start.slice(0, 10);
    return fallback ? [fallback] : [];
  }

  const dates: string[] = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const endFloor = new Date(endDate);
  endFloor.setHours(0, 0, 0, 0);

  while (current.getTime() <= endFloor.getTime()) {
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, '0');
    const dd = String(current.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}
