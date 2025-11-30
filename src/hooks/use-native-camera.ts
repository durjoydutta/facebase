import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { isNative } from '@/lib/mobile';

export const useNativeCamera = () => {
  const getPhoto = async () => {
    if (!isNative()) {
      throw new Error("Not a native platform");
    }

    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });

      return image.dataUrl;
    } catch (error) {
      console.error("Camera error:", error);
      return null;
    }
  };

  return {
    getPhoto,
    isNative: isNative(),
  };
};
