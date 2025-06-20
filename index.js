/**
 * @format
 */

// === CÁC POLYFILL TOÀN CỤC CẦN THIẾT ===
import 'react-native-get-random-values'; // Cho crypto.getRandomValues
import 'react-native-url-polyfill/auto'; // Cho URL toàn cục
import 'stream-browserify';
import { Buffer } from 'buffer';
import process from 'process';
import 'react-native-svg';

global.Buffer = Buffer;
global.process = process;
// === HẾT CÁC POLYFILL TOÀN CỤC ===

import {AppRegistry,LogBox } from 'react-native';
import App from './App';
import {name as appName} from './app.json';
LogBox.ignoreLogs([
  'Warning: Text strings must be rendered within a <Text> component.',
]);

AppRegistry.registerComponent(appName, () => App);