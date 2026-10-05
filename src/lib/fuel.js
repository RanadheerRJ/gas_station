/**
 * Fuel product helpers shared by every screen that draws fuel-coloured dots
 * or offers a fuel-type picker. Kept out of the pages so the shift, stock and
 * setup screens all agree on what "premium" means.
 */

/** The products a nozzle or tank can carry, in picker order. */
export const FUEL_TYPES = ["Petrol", "Diesel", "Premium Petrol", "CNG"];

/** Map a free-text fuel type onto the colour family used across the UI.
 *  MS and HSD are the dispenser print names for the petrol and diesel
 *  families (the same split `classifyFuel` in shiftMath uses for reports),
 *  so they join their family's colour instead of falling through to the
 *  default. */
export const fuelClass = (fuelType = "") => {
  const f = fuelType.toLowerCase();
  if (f.includes("premium")) return "premium";
  if (f.includes("petrol") || f === "ms") return "petrol";
  if (f.includes("diesel") || f.includes("hsd")) return "diesel";
  if (f.includes("cng")) return "cng";
  return "premium";
};
