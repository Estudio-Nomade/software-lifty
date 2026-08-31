import * as ImageManipulator from 'expo-image-manipulator';

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.8;

export async function compressImage(uri: string): Promise<{
  uri: string;
  width: number;
  height: number;
}> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_DIMENSION } }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result;
}
