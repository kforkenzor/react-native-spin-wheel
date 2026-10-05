# React Native Spin Wheel

A spin wheel for React Native, written in TypeScript with
[Reanimated 4](https://docs.swmansion.com/react-native-reanimated/) and
[Gesture Handler](https://docs.swmansion.com/react-native-gesture-handler/).
The wheel face is drawn with `react-native-svg`. The project is an Expo (SDK 57) app.

## What it does

- Drag the wheel and it follows your finger.
- Flick it and it spins, starting at the speed you released it with.
- Tap the **SPIN** hub for a spin at a random speed.
- The pointer flicks as each segment passes under it.
- When the wheel stops, `onSpinEnd` reports the segment under the pointer.
- The wheel is locked while it spins, so the result can't be nudged.

All gesture and animation work runs on the UI thread.

## Run it

```bash
npm install
npx expo start
```

Then open it in Expo Go, or press `w` to open it in a browser.

## Use the component

The component lives in [`src/components/SpinWheel.tsx`](src/components/SpinWheel.tsx).
Wrap your app in `GestureHandlerRootView`, as [`App.tsx`](App.tsx) does.

```tsx
import { SpinWheel, type WheelSegment } from './src/components/SpinWheel';

const segments: WheelSegment[] = [
  { label: 'Pizza', color: '#ef4444' },
  { label: 'Sushi', color: '#f97316' },
  { label: 'Tacos', color: '#eab308', textColor: '#0f172a' },
];

<SpinWheel
  segments={segments}
  size={320}
  onSpinStart={() => console.log('spinning')}
  onSpinEnd={(segment, index) => console.log(segment.label, index)}
/>;
```

| Prop          | Type                                             | Description                                             |
| ------------- | ------------------------------------------------ | ------------------------------------------------------- |
| `segments`    | `WheelSegment[]`                                 | At least two, laid out clockwise from 12 o'clock.       |
| `size`        | `number`                                         | Diameter of the wheel in points.                        |
| `onSpinStart` | `() => void`                                     | Called when a flick or tap starts a spin.               |
| `onSpinEnd`   | `(segment: WheelSegment, index: number) => void` | Called with the winning segment when the wheel stops.   |
