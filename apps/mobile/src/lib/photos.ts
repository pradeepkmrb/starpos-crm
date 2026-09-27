import { Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { ApiError, uploadImage } from "./api";

/** Longest edge after resizing — sharp on a phone, ~100 KB as JPEG. */
const MAX_EDGE = 1080;

export class PhotoError extends Error {}

type Source = "camera" | "library";

async function pick(source: Source, aspect: [number, number]) {
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new PhotoError("Allow camera access in Settings to take a photo.");
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect, quality: 1 };
  const result =
    source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? null : result.assets[0];
}

/** Shrinks the picture and uploads it; returns the stored /media/images/:id path. */
async function shrinkAndUpload(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const context = ImageManipulator.manipulate(asset.uri);
  const landscape = (asset.width ?? 0) >= (asset.height ?? 0);
  context.resize(landscape ? { width: Math.min(MAX_EDGE, asset.width || MAX_EDGE) } : { height: Math.min(MAX_EDGE, asset.height || MAX_EDGE) });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.72, base64: true });
  if (!saved.base64) throw new PhotoError("Couldn't read the photo.");
  const uploaded = await uploadImage({ contentType: "image/jpeg", data: saved.base64 });
  return uploaded.url;
}

/**
 * Asks camera-or-gallery, then resizes and uploads the chosen photo. Resolves
 * to the new photo's path, `null` for "remove", or `undefined` if cancelled.
 */
export function choosePhoto(options: {
  aspect: [number, number];
  canRemove: boolean;
  title: string;
  /** Called once a photo is chosen, before the (slower) upload starts. */
  onUploadStart?: () => void;
}) {
  return new Promise<string | null | undefined>((resolve, reject) => {
    const run = (source: Source) => async () => {
      try {
        const asset = await pick(source, options.aspect);
        if (!asset) return resolve(undefined);
        options.onUploadStart?.();
        resolve(await shrinkAndUpload(asset));
      } catch (err) {
        reject(err instanceof PhotoError || err instanceof ApiError ? err : new PhotoError("Couldn't upload the photo."));
      }
    };
    // The browser preview has no camera sheet; go straight to the file picker.
    if (Platform.OS === "web") {
      void run("library")();
      return;
    }
    Alert.alert(
      options.title,
      undefined,
      [
        { text: "Take photo", onPress: run("camera") },
        { text: "Choose from gallery", onPress: run("library") },
        ...(options.canRemove ? [{ text: "Remove photo", style: "destructive" as const, onPress: () => resolve(null) }] : []),
        { text: "Cancel", style: "cancel", onPress: () => resolve(undefined) },
      ],
      { cancelable: true, onDismiss: () => resolve(undefined) },
    );
  });
}
