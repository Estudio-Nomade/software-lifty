import * as ImagePicker from 'expo-image-picker';
import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Didit getUserMedia only works in Android WebView if the *app* already holds
 * CAMERA (+ often RECORD_AUDIO). RNCWebChromeClient grants the web origin only
 * after those OS permissions are present.
 */
export async function ensureDiditMediaPermissions(): Promise<boolean> {
  const camera = await ImagePicker.requestCameraPermissionsAsync();
  if (camera.status !== 'granted') return false;

  if (Platform.OS === 'android') {
    const mic = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: 'Microfono',
      message: 'Didit necesita el microfono para la verificacion biometrica.',
      buttonPositive: 'Permitir',
      buttonNegative: 'Cancelar',
    });
    if (mic !== PermissionsAndroid.RESULTS.GRANTED) return false;
  }

  return true;
}
