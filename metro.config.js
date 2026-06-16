const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add wasm to asset extensions so Metro can resolve wa-sqlite.wasm in expo-sqlite/web
config.resolver.assetExts.push('wasm');

module.exports = config;
