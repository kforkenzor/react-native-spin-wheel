import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SpinWheel, type WheelSegment } from './src/components/SpinWheel';

const SEGMENTS: WheelSegment[] = [
  { label: 'Pizza', color: '#ef4444' },
  { label: 'Sushi', color: '#f97316' },
  { label: 'Tacos', color: '#eab308', textColor: '#0f172a' },
  { label: 'Burger', color: '#22c55e' },
  { label: 'Ramen', color: '#14b8a6' },
  { label: 'Curry', color: '#3b82f6' },
  { label: 'Pasta', color: '#8b5cf6' },
  { label: 'Salad', color: '#ec4899' },
];

const MAX_WHEEL_SIZE = 380;
const SCREEN_PADDING = 24;

export default function App() {
  const { width } = useWindowDimensions();
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<WheelSegment | null>(null);

  let status = 'Flick the wheel or tap SPIN';
  if (spinning) {
    status = 'Spinning…';
  } else if (winner) {
    status = `You got ${winner.label}!`;
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <Text style={styles.title}>What's for dinner?</Text>
      <SpinWheel
        segments={SEGMENTS}
        size={Math.min(width - SCREEN_PADDING * 2, MAX_WHEEL_SIZE)}
        onSpinStart={() => setSpinning(true)}
        onSpinEnd={(segment) => {
          setSpinning(false);
          setWinner(segment);
        }}
      />
      <Text style={styles.status}>{status}</Text>
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SCREEN_PADDING,
    gap: 32,
  },
  title: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '800',
  },
  status: {
    color: '#e2e8f0',
    fontSize: 20,
    fontWeight: '600',
  },
});
