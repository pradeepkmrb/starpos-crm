// Extends app.json with values that must not be committed. Expo Go ships its
// own Google Maps key, so this only matters for EAS/standalone Android builds:
// set GOOGLE_MAPS_API_KEY (an Android-restricted key) in the EAS environment.
module.exports = ({ config }) => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return config;
  return {
    ...config,
    plugins: [...(config.plugins ?? []), ["react-native-maps", { androidGoogleMapsApiKey: key }]],
  };
};
