/** Shared category policy for every entry point. PIN verification remains in
 * ParentalContext/pin-entry (including master and recovery codes). */
export function categoryAccess(group: string | null | undefined, isKids: boolean,
  isLocked: (group: string) => boolean, isUnlocked: (group: string) => boolean): "allowed" | "pin" | "blocked" {
  const category = String(group || "");
  if (!category || !isLocked(category)) return "allowed";
  if (isKids) return "blocked";
  return isUnlocked(category) ? "allowed" : "pin";
}
