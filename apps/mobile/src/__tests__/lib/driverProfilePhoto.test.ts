import {
  DRIVER_PROFILE_PHOTO_HINT,
  isDriverProfilePhotoPresent,
  isDriverProfilePhotoRemote,
} from '../../lib/driverProfilePhoto';

describe('driverProfilePhoto', () => {
  test('isDriverProfilePhotoPresent rejects empty', () => {
    expect(isDriverProfilePhotoPresent(null)).toBe(false);
    expect(isDriverProfilePhotoPresent(undefined)).toBe(false);
    expect(isDriverProfilePhotoPresent('')).toBe(false);
    expect(isDriverProfilePhotoPresent('   ')).toBe(false);
  });

  test('isDriverProfilePhotoPresent accepts local and remote uris', () => {
    expect(isDriverProfilePhotoPresent('file:///tmp/a.jpg')).toBe(true);
    expect(isDriverProfilePhotoPresent('https://cdn.example/a.jpg')).toBe(true);
  });

  test('isDriverProfilePhotoRemote only http(s)', () => {
    expect(isDriverProfilePhotoRemote('file:///tmp/a.jpg')).toBe(false);
    expect(isDriverProfilePhotoRemote('https://cdn.example/a.jpg')).toBe(true);
    expect(isDriverProfilePhotoRemote('http://cdn.example/a.jpg')).toBe(true);
    expect(isDriverProfilePhotoRemote(null)).toBe(false);
  });

  test('hint copy marks photo required via camera', () => {
    expect(DRIVER_PROFILE_PHOTO_HINT.toLowerCase()).toContain('obligatoria');
    expect(DRIVER_PROFILE_PHOTO_HINT.toLowerCase()).toContain('cámara');
  });
});
