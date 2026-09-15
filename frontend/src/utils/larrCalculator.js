/**
 * Dynamic LARR (RFCTLARR Act 2013) Valuation Engine
 *
 * @param {number} areaSqm - On-ground measured area in sq m
 * @param {number} baseCircleRate - Rate in ₹ per sq m
 * @param {number} assetValue - Estimated structures/trees/crops value in ₹
 * @param {boolean|string} zoneOrIsRural - 'RURAL'/'URBAN' or boolean (true for rural, false for urban)
 * @returns {Object} Itemized valuation breakdown
 */
export function calculatePlotCompensation(areaSqm, baseCircleRate, assetValue = 0, zoneOrIsRural = false) {
  const numArea = Number(areaSqm) || 0;
  const numRate = Number(baseCircleRate) || 0;
  const numAsset = Number(assetValue) || 0;

  const isRural = zoneOrIsRural === true || zoneOrIsRural === 'RURAL' || zoneOrIsRural === 'Rural';
  const zoneType = isRural ? 'RURAL' : 'URBAN';
  const multiplier = isRural ? 2.0 : 1.2;

  // Market Rate = Area (sq m) × baseCircleRate × multiplier
  const marketRate = numArea * numRate * multiplier;
  // Solatium Award = 100% of Calculated Market Rate
  const solatium = marketRate;
  // Total Sanctioned Award = Market Rate + Solatium + Asset Value
  const totalAward = marketRate + solatium + numAsset;

  return {
    baseCircleRate: numRate,
    zoneType,
    isRural,
    multiplier,
    marketRate,
    solatium,
    assetValue: numAsset,
    totalAward,
  };
}

