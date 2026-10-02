// Logical-value storage fixtures: production AsyncStorage JSON decoding is tested separately.
module.exports = function strictFixtureValue(value, fallback, present = true) {
  if (!present) return fallback;
  const primitive = value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
  if (!primitive || (fallback !== null && (value === null || typeof value !== typeof fallback))) {
    throw new Error('Yerel kayıt veri tipi geçersiz.');
  }
  return value;
};
