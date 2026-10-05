import { memo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

export type WheelSegment = {
  label: string;
  color: string;
  textColor?: string;
};

type SpinWheelProps = {
  /** At least two segments, laid out clockwise starting at 12 o'clock. */
  segments: WheelSegment[];
  /** Diameter of the wheel in points. */
  size: number;
  onSpinStart?: () => void;
  onSpinEnd?: (segment: WheelSegment, index: number) => void;
};

const RAD_TO_DEG = 180 / Math.PI;

// Angular velocities, in degrees per second.
const MIN_FLING_VELOCITY = 250;
const MAX_VELOCITY = 2200;
const TAP_VELOCITY_MIN = 1200;
const TAP_VELOCITY_MAX = 2000;

// A faster launch spins for longer: duration = base + |velocity| * perVelocity.
const SPIN_BASE_DURATION_MS = 2000;
const SPIN_DURATION_PER_VELOCITY_MS = 1.5;

// Slope of Easing.out(Easing.cubic) at t = 0. Sizing the spin distance from it
// makes the animation start at exactly the velocity the finger released with.
const EASING_INITIAL_SLOPE = 3;

const HUB_RATIO = 0.24;
const POINTER_WIDTH = 28;
const POINTER_HEIGHT = 34;
const POINTER_OVERLAP = 14;
const POINTER_TILT_DEG = 22;
const RIM_WIDTH = 6;

// SVG text on web falls back to a serif face unless told otherwise.
const LABEL_FONT_FAMILY = Platform.select({ web: 'system-ui, sans-serif' });

/** Index of the segment sitting under the pointer (12 o'clock) for a given wheel rotation. */
function segmentIndexAt(rotationDeg: number, segmentCount: number) {
  'worklet';
  const angleUnderPointer = (((-rotationDeg) % 360) + 360) % 360;
  const index = Math.floor(angleUnderPointer / (360 / segmentCount));
  return Math.min(index, segmentCount - 1);
}

function randomTapVelocity() {
  'worklet';
  return TAP_VELOCITY_MIN + Math.random() * (TAP_VELOCITY_MAX - TAP_VELOCITY_MIN);
}

/** Point on a circle, with the angle measured clockwise from 12 o'clock. */
function polar(center: number, radius: number, angleDeg: number) {
  const angle = angleDeg / RAD_TO_DEG;
  return {
    x: center + radius * Math.sin(angle),
    y: center - radius * Math.cos(angle),
  };
}

const WheelFace = memo(function WheelFace({
  segments,
  size,
}: Pick<SpinWheelProps, 'segments' | 'size'>) {
  const center = size / 2;
  const radius = center - RIM_WIDTH / 2;
  const segmentAngle = 360 / segments.length;
  const fontSize = Math.max(11, size * 0.048);

  return (
    <Svg width={size} height={size}>
      {segments.map((segment, index) => {
        const start = polar(center, radius, index * segmentAngle);
        const end = polar(center, radius, (index + 1) * segmentAngle);
        const largeArc = segmentAngle > 180 ? 1 : 0;

        return (
          <Path
            key={`slice-${index}`}
            d={`M ${center} ${center} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`}
            fill={segment.color}
            stroke="#ffffff"
            strokeWidth={1.5}
          />
        );
      })}
      {segments.map((segment, index) => {
        const midAngle = (index + 0.5) * segmentAngle;
        const labelAt = polar(center, radius * 0.64, midAngle);

        return (
          // Labels run along the radius, reading from the hub outwards.
          <SvgText
            key={`label-${index}`}
            x={labelAt.x}
            y={labelAt.y}
            dy={fontSize * 0.35}
            transform={`rotate(${midAngle - 90} ${labelAt.x} ${labelAt.y})`}
            fill={segment.textColor ?? '#ffffff'}
            fontFamily={LABEL_FONT_FAMILY}
            fontSize={fontSize}
            fontWeight="700"
            textAnchor="middle"
          >
            {segment.label}
          </SvgText>
        );
      })}
      <Circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="#ffffff"
        strokeWidth={RIM_WIDTH}
      />
    </Svg>
  );
});

export function SpinWheel({ segments, size, onSpinStart, onSpinEnd }: SpinWheelProps) {
  const segmentCount = segments.length;
  const radius = size / 2;
  const hubSize = size * HUB_RATIO;
  const hubRadius = hubSize / 2;

  // Start half a segment back so the pointer rests on the middle of segment 0.
  const rotation = useSharedValue(-180 / segmentCount);
  const spinning = useSharedValue(false);
  const grabbed = useSharedValue(false);
  const lastTouchAngle = useSharedValue(0);
  const pointerTilt = useSharedValue(0);

  const notifySpinStart = () => onSpinStart?.();
  const notifySpinEnd = (index: number) => onSpinEnd?.(segments[index], index);

  const spin = (velocity: number) => {
    'worklet';
    const launchVelocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, velocity));
    const duration =
      SPIN_BASE_DURATION_MS + Math.abs(launchVelocity) * SPIN_DURATION_PER_VELOCITY_MS;
    const distance = (launchVelocity * (duration / 1000)) / EASING_INITIAL_SLOPE;

    spinning.value = true;
    scheduleOnRN(notifySpinStart);

    // withDecay would be the obvious choice, but its falloff is too abrupt for
    // a wheel and depends on the display's frame rate. An eased timing gives a
    // long, predictable spin-down instead.
    rotation.value = withTiming(
      rotation.value + distance,
      { duration, easing: Easing.out(Easing.cubic) },
      (finished) => {
        spinning.value = false;
        if (finished) {
          scheduleOnRN(notifySpinEnd, segmentIndexAt(rotation.value, segmentCount));
        }
      },
    );
  };

  // The detector sits on a view that does not rotate, so touch coordinates
  // stay in a fixed frame with the wheel's centre at (radius, radius).
  const pan = Gesture.Pan()
    .onStart((event) => {
      const dx = event.x - radius;
      const dy = event.y - radius;
      const distance = Math.hypot(dx, dy);
      grabbed.value = !spinning.value && distance <= radius && distance >= hubRadius;
      lastTouchAngle.value = Math.atan2(dy, dx);
    })
    .onUpdate((event) => {
      if (!grabbed.value) {
        return;
      }
      const touchAngle = Math.atan2(event.y - radius, event.x - radius);
      let delta = touchAngle - lastTouchAngle.value;
      // atan2 jumps between -PI and PI when the finger crosses 9 o'clock.
      if (delta > Math.PI) {
        delta -= 2 * Math.PI;
      } else if (delta < -Math.PI) {
        delta += 2 * Math.PI;
      }
      rotation.value += delta * RAD_TO_DEG;
      lastTouchAngle.value = touchAngle;
    })
    .onEnd((event) => {
      if (!grabbed.value) {
        return;
      }
      grabbed.value = false;
      const dx = event.x - radius;
      const dy = event.y - radius;
      // Angular velocity is (r x v) / |r|^2. Flooring |r| at the hub keeps a
      // release near the centre from producing a huge value.
      const distanceSq = Math.max(dx * dx + dy * dy, hubRadius * hubRadius);
      const angularVelocity =
        ((dx * event.velocityY - dy * event.velocityX) / distanceSq) * RAD_TO_DEG;
      if (Math.abs(angularVelocity) >= MIN_FLING_VELOCITY) {
        spin(angularVelocity);
      }
    });

  const tap = Gesture.Tap().onEnd((_event, success) => {
    if (success && !spinning.value) {
      spin(randomTapVelocity());
    }
  });

  // Flick the pointer each time a segment boundary passes under it.
  useAnimatedReaction(
    () => rotation.value,
    (current, previous) => {
      if (previous === null || current === previous) {
        return;
      }
      if (segmentIndexAt(current, segmentCount) !== segmentIndexAt(previous, segmentCount)) {
        const direction = current > previous ? 1 : -1;
        pointerTilt.value = withSequence(
          withTiming(-direction * POINTER_TILT_DEG, { duration: 40 }),
          withSpring(0, { mass: 1, damping: 14, stiffness: 320 }),
        );
      }
    },
  );

  const wheelStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const pointerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${pointerTilt.value}deg` }],
  }));

  const hubLabelStyle = useAnimatedStyle(() => ({
    opacity: withTiming(spinning.value ? 0.3 : 1, { duration: 150 }),
  }));

  return (
    <View style={{ width: size, paddingTop: POINTER_HEIGHT - POINTER_OVERLAP }}>
      <GestureDetector gesture={pan}>
        <View style={{ width: size, height: size }}>
          <Animated.View style={[StyleSheet.absoluteFill, wheelStyle]}>
            <WheelFace segments={segments} size={size} />
          </Animated.View>
          <GestureDetector gesture={tap}>
            <View
              accessible
              accessibilityRole="button"
              accessibilityLabel="Spin the wheel"
              style={[
                styles.hub,
                {
                  width: hubSize,
                  height: hubSize,
                  borderRadius: hubRadius,
                  left: radius - hubRadius,
                  top: radius - hubRadius,
                },
              ]}
            >
              <Animated.Text
                style={[styles.hubLabel, { fontSize: hubSize * 0.24 }, hubLabelStyle]}
              >
                SPIN
              </Animated.Text>
            </View>
          </GestureDetector>
        </View>
      </GestureDetector>
      <Animated.View
        pointerEvents="none"
        style={[styles.pointer, { left: radius - POINTER_WIDTH / 2 }, pointerStyle]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hub: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 4,
    borderColor: '#0f172a',
  },
  hubLabel: {
    color: '#0f172a',
    fontWeight: '800',
    letterSpacing: 1,
  },
  pointer: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: POINTER_WIDTH / 2,
    borderRightWidth: POINTER_WIDTH / 2,
    borderTopWidth: POINTER_HEIGHT,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#facc15',
    transformOrigin: 'top',
  },
});
