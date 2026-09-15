export type MarketRentParams = {
  bedrooms?: number | null;
  bathrooms?: number | null;
  square_feet?: number | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  current_rent?: number | null;
};

export type MarketRentEstimate = {
  estimatedRent: number;
  rentRange: {
    low: number;
    high: number;
  };
  difference?: {
    amount: number;
    percentage: number;
    label: string; // e.g. "-$350 (-12%) below market"
    isBelowMarket: boolean;
  } | null;
  compsUrls: {
    zillow: string;
    redfin: string;
  };
};

export function calculateEstimatedMarketRent(params: MarketRentParams): MarketRentEstimate {
  const bedrooms = params.bedrooms !== undefined && params.bedrooms !== null ? Number(params.bedrooms) : 1;
  const bathrooms = params.bathrooms !== undefined && params.bathrooms !== null ? Number(params.bathrooms) : 1;
  const sqft = params.square_feet !== undefined && params.square_feet !== null ? Number(params.square_feet) : null;
  const zip = String(params.postal_code ?? '').trim();
  const city = String(params.city ?? '').trim();
  const state = String(params.state ?? '').trim().toUpperCase();

  // Baseline rent by bedrooms (standard national median)
  let baseRent = 1650;
  let targetSqft = 500;

  if (bedrooms <= 0) {
    baseRent = 1650;
    targetSqft = 450;
  } else if (bedrooms === 1) {
    baseRent = 2150;
    targetSqft = 650;
  } else if (bedrooms === 2) {
    baseRent = 2850;
    targetSqft = 950;
  } else if (bedrooms === 3) {
    baseRent = 3650;
    targetSqft = 1300;
  } else {
    baseRent = 4500 + (bedrooms - 4) * 600;
    targetSqft = 1700 + (bedrooms - 4) * 300;
  }

  // Bathroom adjustments (+ $150 per extra bath)
  if (bathrooms > 1) {
    baseRent += (bathrooms - 1) * 175;
  }

  // Square footage adjustment
  if (sqft && sqft > 0) {
    const sqftDiff = sqft - targetSqft;
    baseRent += Math.round(sqftDiff * 0.85);
  }

  // Geographic multiplier based on zip code and state
  let locationMultiplier = 1.0;

  if (zip.startsWith('921') || zip.startsWith('920')) {
    // San Diego County / Southern California
    locationMultiplier = 1.22;
  } else if (zip.startsWith('94') || zip.startsWith('95')) {
    // SF Bay Area / Silicon Valley
    locationMultiplier = 1.45;
  } else if (zip.startsWith('90') || zip.startsWith('91')) {
    // Los Angeles / Orange County
    locationMultiplier = 1.30;
  } else if (zip.startsWith('10') || zip.startsWith('11')) {
    // New York Metro
    locationMultiplier = 1.50;
  } else if (zip.startsWith('98')) {
    // Seattle / Washington
    locationMultiplier = 1.25;
  } else if (state === 'CA' || city.toLowerCase().includes('san diego')) {
    locationMultiplier = 1.20;
  } else if (state === 'NY' || state === 'MA' || state === 'WA') {
    locationMultiplier = 1.15;
  }

  const finalRent = Math.round((baseRent * locationMultiplier) / 25) * 25;
  const low = Math.round((finalRent * 0.92) / 25) * 25;
  const high = Math.round((finalRent * 1.08) / 25) * 25;

  // Comparison with current actual rent
  let difference = null;
  if (params.current_rent !== undefined && params.current_rent !== null && params.current_rent > 0) {
    const diff = params.current_rent - finalRent;
    const percentage = Math.round((Math.abs(diff) / finalRent) * 100);
    const isBelow = diff < 0;
    const sign = diff > 0 ? '+' : '-';
    difference = {
      amount: diff,
      percentage,
      isBelowMarket: isBelow,
      label: `${sign}$${Math.abs(diff).toLocaleString()}/mo (${sign}${percentage}%) ${isBelow ? 'below market' : 'above market'}`,
    };
  }

  // Generate Search URLs for Zillow & Redfin comps
  const addressParts = [params.address, city, state, zip].filter(Boolean).join(' ');
  const cleanSearchQuery = encodeURIComponent(addressParts || (zip ? `zip ${zip}` : 'rental market'));

  const zillowUrl = addressParts
    ? `https://www.zillow.com/homes/for_rent/${encodeURIComponent(addressParts.replace(/\s+/g, '-'))}_rb/`
    : `https://www.zillow.com/homes/for_rent/`;

  const redfinUrl = zip
    ? `https://www.redfin.com/zipcode/${encodeURIComponent(zip)}/apartments-for-rent`
    : `https://www.redfin.com/city/16904/CA/San-Diego/apartments-for-rent`;

  return {
    estimatedRent: finalRent,
    rentRange: {
      low,
      high,
    },
    difference,
    compsUrls: {
      zillow: zillowUrl,
      redfin: redfinUrl,
    },
  };
}
