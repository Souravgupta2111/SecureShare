/**
 * Expo config plugin: inject WATERMARK_SECRET into the iOS Info.plist.
 *
 * The spread-spectrum watermark PRNG is seeded with HMAC-SHA256(secret, id).
 * For a watermark embedded on one platform to be detectable on the other, both
 * platforms MUST use the same secret. Android reads it at build time from the
 * `WATERMARK_SECRET` environment variable (see
 * modules/secure-watermark/android/build.gradle), falling back to
 * "DEV_FALLBACK_KEY". This plugin does the same for iOS by writing the value
 * into Info.plist at prebuild, where the Swift module reads it via
 * Bundle.main.object(forInfoDictionaryKey:).
 *
 * Set the same WATERMARK_SECRET env var for both `expo prebuild`/EAS iOS builds
 * and Android builds in production. In dev, the shared fallback keeps
 * cross-platform detection working out of the box.
 */
const { withInfoPlist } = require('@expo/config-plugins');

const withWatermarkSecret = (config) => {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.WATERMARK_SECRET = process.env.WATERMARK_SECRET || 'DEV_FALLBACK_KEY';
    return cfg;
  });
};

module.exports = withWatermarkSecret;
