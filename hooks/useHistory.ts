import { useState, useCallback } from 'react';

export const useHistory = <T,>(initialState: T): [
  T,
  (newState: T | ((prevState: T) => T)) => void,
  () => void,
  () => void,
  boolean,
  boolean
] => {
  const [history, setHistory] = useState<T[]>([initialState]);
  const [index, setIndex] = useState(0);

  const setState = useCallback((action: T | ((prevState: T) => T)) => {
    setHistory(currentHistory => {
      const present = currentHistory[index];
      const newState = typeof action === 'function' 
        ? (action as (prevState: T) => T)(present) 
        : action;

      // Deep comparison can be expensive. A simple stringify works for this app's state.
      // For more complex states, a library like fast-deep-equal might be better.
      if (JSON.stringify(present) === JSON.stringify(newState)) {
        return currentHistory;
      }
      
      const newHistory = currentHistory.slice(0, index + 1);
      newHistory.push(newState);
      setIndex(newHistory.length - 1);
      return newHistory;
    });
  }, [index]);

  const undo = useCallback(() => {
    if (index > 0) {
      setIndex(prevIndex => prevIndex - 1);
    }
  }, [index]);

  const redo = useCallback(() => {
    if (index < history.length - 1) {
      setIndex(prevIndex => prevIndex + 1);
    }
  }, [index, history.length]);

  return [history[index], setState, undo, redo, index > 0, index < history.length - 1];
};
