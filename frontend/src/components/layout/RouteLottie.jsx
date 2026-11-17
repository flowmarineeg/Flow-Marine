'use client';

// Auth brand panel motif: a vessel sails POL -> POD along a route with two
// intermediate calls, turns around and sails back, forever (9 s loop, 60 fps).
// The animation is generated shape-layer Lottie JSON (no text), so the port
// labels are plain HTML under the ends of the route.
// Reduced motion: lottie-react does not autoplay, and we park the playhead on a
// frame where the ship is mid-leg with the orange trail behind it.

import { useRef } from 'react';
import { LottieLight } from 'lottie-react';
import voyageRoute from '@/assets/animations/voyage-route.json';

const STILL_FRAME = 130;

const labelRow = { display: 'flex', justifyContent: 'space-between', marginTop: 2, fontSize: 12, lineHeight: 1.35 };

export default function RouteLottie() {
  const lottieRef = useRef(null);

  const subscriptions = {
    ready: () => {
      if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        lottieRef.current?.seek(STILL_FRAME);
      }
    },
  };

  return (
    <div style={{ width: '100%', maxWidth: 440 }}>
      <LottieLight
        src={voyageRoute}
        loop
        autoplay
        lottieRef={lottieRef}
        subscriptions={subscriptions}
        role="img"
        aria-label="A vessel sails from the port of loading to the port of discharge and back"
        style={{ width: '100%', aspectRatio: '410 / 110' }}
      />
      <div style={labelRow} aria-hidden="true">
        <span>
          <strong style={{ color: '#fff', fontWeight: 700, letterSpacing: '1.5px' }}>POL</strong>
          <span style={{ color: '#9DB4CF' }}> — Port of loading</span>
        </span>
        <span style={{ textAlign: 'right' }}>
          <strong style={{ color: '#fff', fontWeight: 700, letterSpacing: '1.5px' }}>POD</strong>
          <span style={{ color: '#9DB4CF' }}> — Port of discharge</span>
        </span>
      </div>
    </div>
  );
}
