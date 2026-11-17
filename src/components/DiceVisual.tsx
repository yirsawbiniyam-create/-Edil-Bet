import React from 'react';

const DICE_LAYOUTS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

interface DiceVisualProps {
  value: number;
  rolling?: boolean;
  size?: 'md' | 'lg';
}

export const DiceVisual: React.FC<DiceVisualProps> = ({
  value,
  rolling = false,
  size = 'lg',
}) => {
  const pips = DICE_LAYOUTS[value] || [5];
  const sizeClass =
    size === 'lg'
      ? 'w-20 h-20 sm:w-28 sm:h-28 rounded-2xl'
      : 'w-16 h-16 sm:w-24 sm:h-24 rounded-xl sm:rounded-2xl';

  return (
    <div className={`${sizeClass} dice-face transition-transform ${rolling ? 'animate-dice-roll' : ''}`}>
      {Array.from({ length: 9 }, (_, idx) => {
        const cell = idx + 1;
        if (!pips.includes(cell)) {
          return <div key={cell} />;
        }
        const isRed = value === 1 || (value === 5 && cell === 5);
        return <div key={cell} className={`pip ${isRed ? 'red' : ''}`} />;
      })}
    </div>
  );
};
