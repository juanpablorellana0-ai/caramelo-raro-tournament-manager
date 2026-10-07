export function upcomingWeekendDates(timeZone: string, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, 12),
  );
  let daysUntilSaturday = (6 - date.getUTCDay() + 7) % 7;

  if (daysUntilSaturday === 0 && parts.hour >= 13) {
    daysUntilSaturday = 7;
  }

  date.setUTCDate(date.getUTCDate() + daysUntilSaturday);
  const saturday = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 1);

  return {
    saturday,
    sunday: date.toISOString().slice(0, 10),
  };
}

export function zonedDateTimeToIso(
  date: string,
  hour: number,
  minute: number,
  timeZone: string,
) {
  const [year, month, day] = date.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let instant = target;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(instant))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    const observed = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const difference = target - observed;

    if (difference === 0) {
      return new Date(instant).toISOString();
    }

    instant += difference;
  }

  return new Date(instant).toISOString();
}
