import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Canvas, type Stroke } from './components/Canvas';
import { PageNavigator } from './components/PageNavigator';
import { recognizeHandwriting, type AnswerLength } from './services/geminiService';
import { useHistory } from './hooks/useHistory';
import type { Language, BackgroundType } from './App';
import type { Tool } from './components/Controls';

export type ShapeType = 
  // 2D
  | 'rectangle' | 'square' | 'circle' | 'oval' | 'line' | 'arrow'
  | 'triangle' | 'rightTriangle' | 'rhombus' | 'parallelogram' | 'trapezoid'
  | 'pentagon' | 'hexagon' | 'star'
  // 3D
  | 'cuboid' | 'cone' | 'pyramid' | 'cylinder' | 'sphere';


export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface RecognizedText {
  id: number;
  text: string;
  bounds: Bounds;
  fontFamily: string;
  fontSize: number;
}
export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}
export interface CanvasStyle {
  backgroundColor: string;
  fontFamily: string;
  fontSize: number;
  backgroundType: BackgroundType;
}

export interface Page {
  id: number;
  strokes: Stroke[];
  texts: RecognizedText[];
}

export interface ToolSettings {
  pen: { size: number; color: string };
  eraser: { size: number };
  shape: { type: ShapeType; size: number; color: string };
}

export interface AppState {
  pages: Page[];
  currentPageIndex: number;
  canvasStyle: CanvasStyle;
  isGlobalStyleEnabled: boolean;
  isSpellingCorrectionEnabled: boolean;
  toolSettings: ToolSettings;
  answerLength: AnswerLength;
}

interface EditorViewProps {
  instanceState: AppState;
  setInstanceState: (updater: (prevState: AppState) => AppState) => void;
  tool: Tool;
  language: Language;
  onGetAnswer: (imageData: string, bounds: Bounds) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}


export const EditorView: React.FC<EditorViewProps> = ({
  instanceState, setInstanceState, tool, language, onGetAnswer,
  isLoading, setIsLoading, error, setError,
}) => {
  const [state, setState, undo, redo, canUndo, canRedo] = useHistory<AppState>(instanceState);
  const { pages, currentPageIndex, canvasStyle, isGlobalStyleEnabled, toolSettings } = state;
  const currentPage = useMemo(() => pages[currentPageIndex], [pages, currentPageIndex]);

  useEffect(() => {
    setInstanceState(() => state);
  }, [state, setInstanceState]);

  // Sync external state changes (like tool settings from App) into the history state.
  useEffect(() => {
      // Avoid unnecessary updates if the state is already in sync.
      // Stringify is a simple but potentially slow way to deep compare. It's acceptable here.
      if (JSON.stringify(instanceState.toolSettings) !== JSON.stringify(toolSettings)) {
          setState(s => ({ ...s, toolSettings: instanceState.toolSettings }));
      }
  }, [instanceState.toolSettings, toolSettings, setState]);

  const [viewTransform, setViewTransform] = useState<ViewTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [recognitionTrigger, setRecognitionTrigger] = useState(0);
  const [confirmation, setConfirmation] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const debouncedCanvasStyle = useDebouncedValue(canvasStyle, 300);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['+', '=', '-', '0'].includes(e.key)) e.preventDefault();
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const updateCurrentPage = useCallback((updater: (page: Page) => Page) => {
    setState(currentState => {
      const newPages = [...currentState.pages];
      newPages[currentState.currentPageIndex] = updater(newPages[currentState.currentPageIndex]);
      return { ...currentState, pages: newPages };
    });
  }, [setState]);
  
  useEffect(() => {
    if (isGlobalStyleEnabled) {
        updateCurrentPage(page => {
            const hasChanges = page.texts.some(text =>
                text.fontFamily !== debouncedCanvasStyle.fontFamily || text.fontSize !== debouncedCanvasStyle.fontSize
            );
            if (!hasChanges) return page;

            return {
                ...page,
                texts: page.texts.map(text => ({
                    ...text,
                    fontFamily: debouncedCanvasStyle.fontFamily,
                    fontSize: debouncedCanvasStyle.fontSize,
                }))
            };
        });
    }
  }, [isGlobalStyleEnabled, debouncedCanvasStyle, updateCurrentPage]);

  const handleSetStrokes = (updater: React.SetStateAction<Stroke[]>) => {
    updateCurrentPage(page => ({
      ...page,
      strokes: typeof updater === 'function' ? updater(page.strokes) : updater,
    }));
  };
  
  const handleTextUpdate = useCallback((textId: number, newBounds: Bounds) => {
    updateCurrentPage(page => ({
        ...page,
        texts: page.texts.map(text =>
            text.id === textId ? { ...text, bounds: newBounds } : text
        ),
    }));
  }, [updateCurrentPage]);

  const handleItemsDelete = useCallback(({ strokeIds, textIds }: { strokeIds: number[], textIds: number[] }) => {
    if (strokeIds.length === 0 && textIds.length === 0) return;
    const strokeIdSet = new Set(strokeIds);
    const textIdSet = new Set(textIds);
    updateCurrentPage(page => ({
      ...page,
      strokes: page.strokes.filter(s => !strokeIdSet.has(s.id)),
      texts: page.texts.filter(t => !textIdSet.has(t.id)),
    }));
  }, [updateCurrentPage]);

  const handleRecognize = useCallback(async (imageData: string, bounds: Bounds) => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      const base64Data = imageData.split(',')[1];
      const result = await recognizeHandwriting(base64Data, language, state.isSpellingCorrectionEnabled);
      
      updateCurrentPage(page => {
        const { fontFamily, fontSize, backgroundType } = state.canvasStyle;
        let finalBounds = { ...bounds };

        if (backgroundType === 'copybook') {
            const lineSpacing = 80;
            const originalBaselineY = bounds.y + fontSize;
            const nearestLineY = Math.round(originalBaselineY / lineSpacing) * lineSpacing;
            finalBounds.y = nearestLineY - fontSize;
        }

        const newText: RecognizedText = {
          id: Date.now(), text: result, bounds: finalBounds, fontFamily, fontSize,
        };
        return { ...page, strokes: [], texts: [...page.texts, newText] };
      });
    } catch (err) {
      console.error(err);
      setError('Failed to recognize handwriting. Please try again.');
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, language, state.canvasStyle, state.isSpellingCorrectionEnabled, updateCurrentPage, setIsLoading, setError]);

  const handleClear = useCallback(() => {
    updateCurrentPage(page => ({ ...page, strokes: [], texts: [] }));
    setError(null);
  }, [updateCurrentPage, setError]);

  const handleResetSettings = () => {
    // This function now needs to reset only the instance-specific settings,
    // getting defaults from a factory function might be cleaner, but for now this is ok.
     const initialCanvasStyle: CanvasStyle = {
        backgroundColor: '#fef3c7', fontFamily: 'Caveat', fontSize: 48, backgroundType: 'copybook',
     };
     const initialToolSettings: ToolSettings = {
        pen: { size: 5, color: '#333333' }, eraser: { size: 20 },
        shape: { type: 'rectangle', size: 5, color: '#333333' }
     };
      setState(currentState => ({
        ...currentState,
        canvasStyle: initialCanvasStyle,
        toolSettings: initialToolSettings,
        isGlobalStyleEnabled: false,
        isSpellingCorrectionEnabled: false,
        answerLength: 'compact',
      }));
      setViewTransform({ scale: 1, offsetX: 0, offsetY: 0 });
  };
  
  const requestClear = () => {
    if (currentPage.strokes.length === 0 && currentPage.texts.length === 0) return;
    setConfirmation({
        title: 'Clear Canvas',
        message: 'Are you sure you want to clear everything on this page? This action cannot be undone.',
        onConfirm: () => { handleClear(); setConfirmation(null); }
    });
  };

  const requestReset = () => {
      setConfirmation({
          title: 'Reset All Settings',
          message: 'Are you sure you want to reset all tool and style settings for this subject to their defaults?',
          onConfirm: () => { handleResetSettings(); setConfirmation(null); }
      });
  };

  useEffect(() => {
    (window as any).editorViewControls = {
        undo, redo, canUndo, canRedo,
        handleRecognize: () => setRecognitionTrigger(c => c + 1),
        requestClear, requestReset,
        setState
    };
    // Notify Controls component to re-render and pick up the new functions
    (window as any)._reRenderControls?.();
  }, [undo, redo, canUndo, canRedo, requestClear, requestReset, setState]);


  const handleAddPage = () => {
    const newPage: Page = { id: Date.now(), strokes: [], texts: [] };
    setState({
      ...state,
      pages: [...state.pages, newPage],
      currentPageIndex: state.pages.length,
    });
  };

  const handleChangePage = (newIndex: number) => {
    if (newIndex >= 0 && newIndex < state.pages.length) {
      setState({ ...state, currentPageIndex: newIndex });
    }
  };

  return (
    <>
      <Canvas
        strokes={currentPage.strokes}
        setStrokes={handleSetStrokes}
        texts={currentPage.texts}
        tool={tool}
        toolSettings={toolSettings}
        viewTransform={viewTransform}
        setViewTransform={setViewTransform}
        canvasStyle={canvasStyle}
        onRecognize={handleRecognize}
        onGetAnswer={onGetAnswer}
        onItemsDelete={handleItemsDelete}
        onTextUpdate={handleTextUpdate}
        recognitionTrigger={recognitionTrigger}
      />
       <PageNavigator
        currentPage={currentPageIndex + 1}
        totalPages={pages.length}
        onNext={() => handleChangePage(currentPageIndex + 1)}
        onPrev={() => handleChangePage(currentPageIndex - 1)}
        onAddPage={handleAddPage}
      />
       {confirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" aria-modal="true" role="dialog">
            <div className="bg-card p-6 rounded-lg shadow-xl w-full max-w-sm mx-4 border border-border">
                <h2 className="text-xl font-bold mb-2 text-card-foreground">{confirmation.title}</h2>
                <p className="text-muted-foreground mb-6">{confirmation.message}</p>
                <div className="flex justify-end space-x-3">
                    <button onClick={() => setConfirmation(null)} className="px-4 py-2 rounded-md bg-secondary text-secondary-foreground font-semibold hover:bg-accent transition-colors">Cancel</button>
                    <button onClick={confirmation.onConfirm} className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground font-semibold hover:bg-destructive-hover transition-colors">Confirm</button>
                </div>
            </div>
        </div>
      )}
    </>
  );
};