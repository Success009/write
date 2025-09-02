import React from 'react';

interface PageNavigatorProps {
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  onAddPage: () => void;
}

export const PageNavigator: React.FC<PageNavigatorProps> = ({
  currentPage,
  totalPages,
  onPrev,
  onNext,
  onAddPage,
}) => {
  const buttonClasses = "px-3 py-1 bg-card rounded-md shadow-lg text-card-foreground hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-border";

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center space-x-4 z-10">
      <button onClick={onPrev} disabled={currentPage <= 1} className={buttonClasses}>
        &lt;
      </button>
      <span className="font-semibold text-card-foreground bg-card px-4 py-1 rounded-md shadow-lg border border-border">
        {currentPage} / {totalPages}
      </span>
      <button onClick={onNext} disabled={currentPage >= totalPages} className={buttonClasses}>
        &gt;
      </button>
      <button onClick={onAddPage} className={`${buttonClasses} font-bold`}>
        +
      </button>
    </div>
  );
};