import { useEffect, useState } from 'react';
import { Dimensions, ScaledSize } from 'react-native';

export interface Responsive {
  width: number;
  height: number;
  isPhone: boolean;
  isTablet: boolean;
  isLandscape: boolean;
  columns: {
    poster: number;
    channelList: number;
  };
}

function compute(w: number, h: number): Responsive {
  const shortSide = Math.min(w, h);
  const isTablet = shortSide >= 600;
  const isLandscape = w > h;
  return {
    width: w,
    height: h,
    isPhone: !isTablet,
    isTablet,
    isLandscape,
    columns: {
      poster: isTablet ? (isLandscape ? 6 : 5) : (isLandscape ? 5 : 3),
      channelList: isTablet ? 2 : 1,
    },
  };
}

export function useResponsive(): Responsive {
  const [state, setState] = useState<Responsive>(() => {
    const { width, height } = Dimensions.get('window');
    return compute(width, height);
  });

  useEffect(() => {
    const handler = ({ window }: { window: ScaledSize }) => {
      setState(compute(window.width, window.height));
    };
    const sub = Dimensions.addEventListener('change', handler);
    return () => sub?.remove();
  }, []);

  return state;
}
