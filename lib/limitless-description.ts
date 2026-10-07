function spanishOrdinal(number: number) {
  switch (number) {
    case 1:
      return "primer";
    case 2:
      return "segundo";
    case 3:
      return "tercer";
    case 4:
      return "cuarto";
    default:
      return `${number}.º`;
  }
}

function englishOrdinal(number: number) {
  switch (number) {
    case 1:
      return "first";
    case 2:
      return "second";
    case 3:
      return "third";
    case 4:
      return "fourth";
    default: {
      const lastTwoDigits = number % 100;
      const suffix =
        lastTwoDigits >= 11 && lastTwoDigits <= 13
          ? "th"
          : number % 10 === 1
            ? "st"
            : number % 10 === 2
              ? "nd"
              : number % 10 === 3
                ? "rd"
                : "th";
      return `${number}${suffix}`;
    }
  }
}

function regulationCode(format: string, rules: string) {
  const regulationPattern = /\bregulaci[oó]n\s+([a-z0-9]+(?:-[a-z0-9]+)*)/i;
  const englishPattern = /\bregulation\s+([a-z0-9]+(?:-[a-z0-9]+)*)/i;

  for (const value of [format, rules]) {
    const match = value.match(regulationPattern) ?? value.match(englishPattern);
    if (match) return match[1];
  }

  return null;
}

export function createLimitlessDescription(input: {
  weeklyNumber: number;
  game: string;
  format: string;
  rules: string;
}) {
  if (input.game !== "pokemon_vgc") {
    return {
      content: null,
      error: "Esta plantilla de Limitless solo está preparada para Pokémon VGC.",
    };
  }

  const code = regulationCode(input.format, input.rules);
  if (!code) {
    return {
      content: null,
      error:
        "No se pudo identificar la regulación actual en el formato o las reglas del torneo.",
    };
  }

  const spanishWelcome = spanishOrdinal(input.weeklyNumber);
  const englishWelcome = englishOrdinal(input.weeklyNumber);
  const spanishRegulation = `Regulación ${code}`;
  const englishRegulation = `Regulation ${code}`;

  return {
    error: null,
    content: [
      `# 🍬 CARAMELO RARO — WEEKLY #${input.weeklyNumber}`,
      "",
      `¡Bienvenidos al ${spanishWelcome} torneo semanal de **Caramelo Raro**! ⚔️`,
      "",
      "Una nueva oportunidad para competir, poner a prueba tus equipos y seguir mejorando en Pokémon VGC.",
      "",
      "## ⚔️ FORMATO",
      "",
      "🍬 VGC Dobles",
      "",
      "🍬 Mejor de 3 (Bo3)",
      "",
      "🍬 Open Team Sheet",
      "",
      `🍬 ${spanishRegulation}`,
      "",
      "🍬 Rondas Suizas + Top Cut",
      "",
      "🍬 Top Cut: Eliminación Directa",
      "",
      "## 🔄 RONDAS SUIZAS",
      "",
      "El número de rondas y el tamaño del Top Cut dependerán de la cantidad de jugadores registrados:",
      "",
      "• **4–8 jugadores** → 3 rondas + Top 2",
      "",
      "• **9–16 jugadores** → 4 rondas + Top 4",
      "",
      "• **17–32 jugadores** → 5 rondas + Top 8",
      "",
      "• **33–64 jugadores** → 6 rondas + Top 16",
      "",
      "• **65–128 jugadores** → 7 rondas + Top 16",
      "",
      "Durante las rondas suizas, los jugadores serán emparejados contra oponentes con un récord similar.",
      "",
      "Al finalizar Swiss, los jugadores que clasifiquen avanzarán al **Top Cut**, donde los enfrentamientos serán de Eliminación Directa.",
      "",
      "## 🏆 COMPITE • APRENDE • MEJORA",
      "",
      "No importa si eres un jugador experimentado o estás comenzando en el competitivo: cada partida es una oportunidad para aprender y mejorar.",
      "",
      "¡Nos vemos en el campo de batalla, Entrenadores! 🍬⚔️",
      "",
      "━━━━━━━━━━━ 🍬 ⚔️ 🍬 ━━━━━━━━━━━",
      "",
      `# 🍬 CARAMELO RARO — WEEKLY #${input.weeklyNumber}`,
      "",
      `Welcome to the ${englishWelcome} weekly tournament from **Caramelo Raro**! ⚔️`,
      "",
      "Another opportunity to compete, test your teams, and keep improving in Pokémon VGC.",
      "",
      "## ⚔️ FORMAT",
      "",
      "🍬 VGC Doubles",
      "",
      "🍬 Best of 3 (Bo3)",
      "",
      "🍬 Open Team Sheet",
      "",
      `🍬 ${englishRegulation}`,
      "",
      "🍬 Swiss Rounds + Top Cut",
      "",
      "🍬 Top Cut: Single Elimination",
      "",
      "## 🔄 SWISS ROUNDS",
      "",
      "The number of Swiss rounds and the size of the Top Cut will depend on the number of registered players:",
      "",
      "• **4–8 players** → 3 rounds + Top 2",
      "",
      "• **9–16 players** → 4 rounds + Top 4",
      "",
      "• **17–32 players** → 5 rounds + Top 8",
      "",
      "• **33–64 players** → 6 rounds + Top 16",
      "",
      "• **65–128 players** → 7 rounds + Top 16",
      "",
      "During the Swiss rounds, players will be paired against opponents with similar records.",
      "",
      "After Swiss, the players who qualify will advance to the **Top Cut**, where all matches will be played in a Single Elimination bracket.",
      "",
      "## 🏆 COMPETE • LEARN • IMPROVE",
      "",
      "Whether you're an experienced player or just starting your competitive journey, every battle is an opportunity to learn and improve.",
      "",
      "See you on the battlefield, Trainers! 🍬⚔️",
    ].join("\n").replaceAll("\\*", "*"),
  };
}
