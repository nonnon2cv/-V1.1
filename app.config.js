import 'dotenv/config';

export default {
  expo: {
    name: "shift-calendar-app",
    slug: "shift-calendar-app",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.yourcompany.shiftcalendar",
      infoPlist: {
        NSCameraUsageDescription: "シフト表を撮影するためにカメラを使用します",
        NSPhotoLibraryUsageDescription: "シフト表の画像を選択するためにギャラリーにアクセスします",
        NSCalendarsUsageDescription: "シフトをカレンダーに登録するためにカレンダーへのアクセスが必要です"
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      package: "com.yourcompany.shiftcalendar",
      permissions: [
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "READ_CALENDAR",
        "WRITE_CALENDAR"
      ]
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      [
        "expo-image-picker",
        {
          "photosPermission": "シフト表の画像を選択するためにギャラリーにアクセスします",
          "cameraPermission": "シフト表を撮影するためにカメラを使用します"
        }
      ],
      [
        "expo-calendar",
        {
          "calendarPermission": "シフトをカレンダーに登録するためにカレンダーへのアクセスが必要です"
        }
      ]
    ],
    extra: {
      geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY,
    },
  }
};
