export type AvailabilityOptionInput = {
  id: string;
  startsAt: string;
};

export type AvailabilityRankingEntry = {
  optionId: string;
  startsAt: string;
  day: "saturday" | "sunday";
  dayLabel: string;
  dateLabel: string;
  timeLabel: string;
  responseCount: number;
  responsePercentage: number;
};

export type AvailabilityRecommendation = {
  recommendedOptionId: string | null;
  recommendedCount: number | null;
  secondOptionId: string | null;
  secondCount: number | null;
  totalResponses: number;
  ranking: AvailabilityRankingEntry[];
  hasTie: boolean;
  tieCount: number;
  recommendationStatus: "no_options" | "no_responses" | "recommended";
};

type LocalDateTime = {
  day: "saturday" | "sunday";
  dateKey: string;
  hour: number;
  minute: number;
  dayLabel: string;
  dateLabel: string;
  timeLabel: string;
};

function getLocalDateTime(startsAt: string, timeZone: string): LocalDateTime {
  const instant = new Date(startsAt);
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
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
  })
    .format(instant)
    .toLowerCase();
  const day = weekday === "sunday" ? "sunday" : "saturday";

  return {
    day,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    dayLabel: day === "saturday" ? "Sábado" : "Domingo",
    dateLabel: new Intl.DateTimeFormat("es", {
      timeZone,
      day: "numeric",
      month: "long",
    }).format(instant),
    timeLabel: new Intl.DateTimeFormat("es", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(instant),
  };
}

export function recommendAvailability(
  options: AvailabilityOptionInput[],
  responses: string[][],
  timeZone: string,
): AvailabilityRecommendation {
  const counts = new Map(options.map((option) => [option.id, 0]));
  const validOptionIds = new Set(counts.keys());

  for (const responseSelections of responses) {
    for (const optionId of new Set(responseSelections)) {
      if (validOptionIds.has(optionId)) {
        counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
      }
    }
  }

  const ranking = options
    .map((option) => {
      const local = getLocalDateTime(option.startsAt, timeZone);
      return {
        optionId: option.id,
        startsAt: option.startsAt,
        ...local,
        responseCount: counts.get(option.id) ?? 0,
        responsePercentage:
          responses.length === 0
            ? 0
            : Math.round(((counts.get(option.id) ?? 0) / responses.length) * 100),
      };
    })
    .sort((a, b) => {
      if (a.responseCount !== b.responseCount) {
        return b.responseCount - a.responseCount;
      }
      if (a.hour !== b.hour) {
        return a.hour - b.hour;
      }
      if (a.minute !== b.minute) {
        return a.minute - b.minute;
      }
      if (a.dateKey !== b.dateKey) {
        return a.dateKey.localeCompare(b.dateKey);
      }
      return a.optionId.localeCompare(b.optionId);
    })
    .map(({ dateKey: _dateKey, hour: _hour, minute: _minute, ...entry }) => entry);

  if (options.length === 0) {
    return {
      recommendedOptionId: null,
      recommendedCount: null,
      secondOptionId: null,
      secondCount: null,
      totalResponses: responses.length,
      ranking,
      hasTie: false,
      tieCount: 0,
      recommendationStatus: "no_options",
    };
  }

  if (responses.length === 0) {
    return {
      recommendedOptionId: null,
      recommendedCount: null,
      secondOptionId: null,
      secondCount: null,
      totalResponses: 0,
      ranking,
      hasTie: false,
      tieCount: 0,
      recommendationStatus: "no_responses",
    };
  }

  const recommendedCount = ranking[0].responseCount;
  const tieCount = ranking.filter(
    (entry) => entry.responseCount === recommendedCount,
  ).length;

  return {
    recommendedOptionId: ranking[0].optionId,
    recommendedCount,
    secondOptionId: ranking[1]?.optionId ?? null,
    secondCount: ranking[1]?.responseCount ?? null,
    totalResponses: responses.length,
    ranking,
    hasTie: tieCount > 1,
    tieCount,
    recommendationStatus: "recommended",
  };
}
