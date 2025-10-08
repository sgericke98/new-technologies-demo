import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import countryIsoData from "../../countryiso.json";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert ISO country code to full country name
 * Returns the full name for non-US countries, keeps the ISO code for US
 */
export function getCountryDisplayName(countryCode: string | null): string {
  if (!countryCode) return '';
  
  // Keep US as is (or you can return 'United States' if preferred)
  if (countryCode.toUpperCase() === 'US') {
    return 'US';
  }
  
  // Find the full name for other countries
  const country = countryIsoData.find(
    (c) => c.Code.toUpperCase() === countryCode.toUpperCase()
  );
  
  return country ? country.Name : countryCode;
}
