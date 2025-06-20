const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const config = {
    resolver: {
        extraNodeModules: {
            stream: require.resolve('stream-browserify'),
            events: require.resolve('events/'),
            buffer: require.resolve('buffer/'),
            process: require.resolve('process/browser'),
            util: require.resolve('util/'),
            url: require.resolve('url/'),
            http: require.resolve('http-browserify'),
            crypto: require.resolve('react-native-crypto'),
            https: require.resolve('https-browserify'),
            net: require.resolve('net-browserify'),
            tls: require.resolve('tls-browserify'),
            zlib: require.resolve('browserify-zlib'),
            assert: require.resolve('assert'),
            querystring: require.resolve('querystring-es3'),
            path: require.resolve('path-browserify'),
            fs: require.resolve('react-native-level-fs'),
        },
    },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
