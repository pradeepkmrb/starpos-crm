// Extends app.json with values that must not be committed.
//
// GOOGLE_MAPS_API_KEY: Expo Go ships its own Google Maps key, so this only
// matters for EAS/standalone Android builds — an Android-restricted key set in
// the EAS environment.
//
// GOOGLE_SERVICES_JSON: Firebase's google-services.json for com.touch4bill.digitel.
// On EAS it is a "file" environment variable, so this holds the path EAS wrote
// the file to; locally, drop the file next to this one (it is gitignored).
const fs = require("fs");
const path = require("path");

module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  const localServices = path.join(__dirname, "google-services.json");
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ?? (fs.existsSync(localServices) ? "./google-services.json" : undefined);

  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    plugins: [
      ...(config.plugins ?? []),
      ...(mapsKey ? [["react-native-maps", { androidGoogleMapsApiKey: mapsKey }]] : []),
    ],
  };
};
