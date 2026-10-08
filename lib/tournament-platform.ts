export const TOURNAMENT_PLATFORMS = {
  pokemon_vgc: [
    { value: "pokemon_champions", label: "Pokémon Champions" },
    { value: "pokemon_showdown", label: "Pokémon Showdown" },
  ],
  pokemon_tcg: [
    { value: "pokemon_tcg_live", label: "Pokémon TCG Live" },
    { value: "pokemon_tcg_pocket", label: "Pokémon TCG Pocket" },
  ],
} as const;

export type TournamentGame = keyof typeof TOURNAMENT_PLATFORMS;
export type TournamentPlatform =
  (typeof TOURNAMENT_PLATFORMS)[TournamentGame][number]["value"];

export function isTournamentGame(value: unknown): value is TournamentGame {
  return value === "pokemon_vgc" || value === "pokemon_tcg";
}

export function isPlatformForGame(
  game: unknown,
  platform: unknown,
): platform is TournamentPlatform {
  return (
    isTournamentGame(game) &&
    TOURNAMENT_PLATFORMS[game].some((option) => option.value === platform)
  );
}
