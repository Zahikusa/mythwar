/**
 * The iPhone and iPad screens an installed Mythwar gets a launch image for (CSS width × height
 * upright, device pixel ratio). iOS shows the image matching the screen while the game starts —
 * without one it shows a white screen. Used by scripts/splash.ts (draws them into
 * public/splash/) and vite.config.ts (the <link rel="apple-touch-startup-image"> tags).
 */
export const SPLASH_SCREENS: [w: number, h: number, dpr: number][] = [
  [440, 956, 3], // iPhone 16/17 Pro Max
  [402, 874, 3], // iPhone 16/17 Pro, 17
  [430, 932, 3], // iPhone 14 Pro Max, 15 Plus/Pro Max, 16 Plus
  [393, 852, 3], // iPhone 14 Pro, 15, 15 Pro, 16
  [428, 926, 3], // iPhone 12/13 Pro Max, 14 Plus
  [390, 844, 3], // iPhone 12, 13, 14, 16e
  [375, 812, 3], // iPhone X, XS, 11 Pro, 12/13 mini
  [414, 896, 3], // iPhone XS Max, 11 Pro Max
  [414, 896, 2], // iPhone XR, 11
  [414, 736, 3], // iPhone 8 Plus
  [375, 667, 2], // iPhone SE (2nd/3rd), 8
  [1032, 1376, 2], // iPad Pro 13" (M4)
  [1024, 1366, 2], // iPad Pro 12.9"
  [834, 1210, 2], // iPad Pro 11" (M4)
  [834, 1194, 2], // iPad Pro 11"
  [820, 1180, 2], // iPad Air 10.9", iPad 10th
  [834, 1112, 2], // iPad Air 10.5"
  [810, 1080, 2], // iPad 10.2"
  [768, 1024, 2], // iPad 9.7", mini 5
  [744, 1133, 2], // iPad mini 6
];

/** The file and media query of each launch image, upright and sideways. */
export function splashLinks(): { file: string; media: string; w: number; h: number }[] {
  return SPLASH_SCREENS.flatMap(([w, h, dpr]) =>
    (['portrait', 'landscape'] as const).map((o) => {
      const [pw, ph] = o === 'portrait' ? [w * dpr, h * dpr] : [h * dpr, w * dpr];
      return {
        file: `splash/${pw}x${ph}.png`,
        media: `screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${o})`,
        w: pw,
        h: ph,
      };
    }),
  );
}
