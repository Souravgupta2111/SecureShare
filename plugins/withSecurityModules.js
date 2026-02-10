/**
 * Expo Config Plugin for SecureShare Security Modules
 * 
 * This plugin automatically configures native security modules
 * when running `npx expo prebuild`.
 * 
 * Usage: Add to app.json/app.config.js:
 * {
 *   "plugins": [
 *     "./plugins/withSecurityModules"
 *   ]
 * }
 */

const { withMainApplication, withAppBuildGradle, withXcodeProject } = require('@expo/config-plugins');

const withSecurityModulesAndroid = (config) => {
    return withMainApplication(config, (config) => {
        const mainApplication = config.modResults;

        // Add import for FlagSecurePackage
        if (!mainApplication.contents.includes('import com.secureshare.FlagSecurePackage')) {
            mainApplication.contents = mainApplication.contents.replace(
                'import com.facebook.react.ReactApplication',
                `import com.facebook.react.ReactApplication
import com.secureshare.FlagSecurePackage`
            );
        }

        // Add package to getPackages()
        if (!mainApplication.contents.includes('FlagSecurePackage()')) {
            mainApplication.contents = mainApplication.contents.replace(
                'packages.add(new ReactNativeHostWrapper.createAdditionalReactPackage());',
                `packages.add(FlagSecurePackage())
        packages.add(new ReactNativeHostWrapper.createAdditionalReactPackage());`
            );
        }

        return config;
    });
};

const withSecurityModulesIOS = (config) => {
    return withXcodeProject(config, async (config) => {
        // iOS modules are automatically linked via Swift/ObjC files
        // Just need to ensure bridging header exists
        return config;
    });
};

const withSecurityModules = (config) => {
    config = withSecurityModulesAndroid(config);
    config = withSecurityModulesIOS(config);
    return config;
};

module.exports = withSecurityModules;
