/**
 * Expo config plugin: force a minimum iOS deployment target on EVERY CocoaPods
 * target, including resource-bundle targets (e.g. *_PrivacyInfo, *_resources).
 *
 * Why: Xcode 26 fails the build if any target's IPHONEOS_DEPLOYMENT_TARGET is
 * below the supported range (15.0). Some pods (react-native-blob-util,
 * @react-native-async-storage, SDWebImage) ship resource bundles pinned to old
 * targets (11.0 / 13.4 / 9.0). expo-build-properties' `ios.deploymentTarget`
 * only bumps the main pod targets, not these resource bundles — so we patch the
 * Podfile's post_install to iterate ALL targets.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '[min-ios-deployment-target]';
const SNIPPET = `
    # ${MARKER} Force all pod targets (incl. resource bundles) to iOS 15.1
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |bc|
        current = bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || current.to_f < 15.1
          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
        end
      end
    end
`;

module.exports = function withMinIosDeploymentTarget(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');
      if (!contents.includes(MARKER)) {
        // Insert at the top of the post_install block.
        contents = contents.replace(
          /post_install do \|installer\|\n/,
          `post_install do |installer|\n${SNIPPET}`
        );
        fs.writeFileSync(podfilePath, contents);
      }
      return cfg;
    },
  ]);
};
