export const CUSTOM_PRODUCT_OPTION = "__custom__";

export const PRODUCT_CATEGORIES = [
  "Ikan",
  "Udang",
  "Cumi",
  "Gurita",
  "Kepiting",
  "Kerang",
  "Lobster",
] as const;

export const PRODUCT_UNITS = ["kg", "gram", "ekor", "pcs", "pack", "box", "karton"] as const;

export function choiceFor(value: string, options: readonly string[]) {
  return options.includes(value) ? value : CUSTOM_PRODUCT_OPTION;
}
