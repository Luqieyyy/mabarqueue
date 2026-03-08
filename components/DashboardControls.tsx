'use client';

interface Props {
  onFinishGame: () => void;
  onSkipPlayer: () => void;
  hasCurrentPlayer: boolean;
  loading: boolean;
}

export default function DashboardControls({
  onFinishGame,
  onSkipPlayer,
  hasCurrentPlayer,
  loading,
}: Props) {
  return (
    <div className="flex gap-3">
      <button
        onClick={onFinishGame}
        disabled={!hasCurrentPlayer || loading}
        className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors text-sm"
      >
        {loading ? '...' : 'Finish Game'}
      </button>
      <button
        onClick={onSkipPlayer}
        disabled={!hasCurrentPlayer || loading}
        className="flex-1 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors text-sm"
      >
        {loading ? '...' : 'Skip Player'}
      </button>
    </div>
  );
}
