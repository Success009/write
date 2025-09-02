import React, { useState, useCallback, useEffect } from 'react';
import { Controls, type Tool } from './components/Controls';
import { getAnswerFromImage, type AnswerLength } from './services/geminiService';
import { EditorView, type AppState, type ShapeType } from './EditorView';
import { AnswerModal } from './components/AnswerModal';
import { ShapePalette } from './components/ShapePalette';

export type Language = 'english' | 'nepali';
export type BackgroundType = 'copybook' | 'grid' | 'borderline' | 'plain';

export type Theme = 'light' | 'dark';
export type Subject = 'Math' | 'English' | 'Computer' | 'Science' | 'Social' | 'Population' | 'Nepali';
const SUBJECTS: Subject[] = ['Math', 'English', 'Computer', 'Science', 'Social', 'Population', 'Nepali'];

export interface ControlsState {
  position: { x: number; y: number };
  size: { width: number };
}

export interface AppData {
  instances: Record<Subject, AppState>;
  activeSubject: Subject;
  theme: Theme;
  controls: ControlsState;
}

const createInitialState = (): AppState => ({
  pages: [{ id: Date.now(), strokes: [], texts: [] }],
  currentPageIndex: 0,
  canvasStyle: {
    backgroundColor: '#fef3c7',
    fontFamily: 'Caveat',
    fontSize: 48,
    backgroundType: 'copybook',
  },
  isGlobalStyleEnabled: false,
  isSpellingCorrectionEnabled: false,
  toolSettings: {
    pen: { size: 5, color: '#333333' },
    eraser: { size: 20 },
    shape: { type: 'rectangle' as ShapeType, size: 5, color: '#333333' },
  },
  answerLength: 'compact',
});

const getInitialAppData = (): AppData => {
  try {
    const savedState = localStorage.getItem('handwriting-app-state-v2');
    if (savedState) {
      const parsed = JSON.parse(savedState);
      if (parsed.instances && parsed.activeSubject) {
        // Migration: Add shape settings if they don't exist
        Object.values(parsed.instances).forEach((instance: any) => {
            if (!instance.toolSettings.shape) {
                instance.toolSettings.shape = { type: 'rectangle', size: 5, color: '#333333' };
            }
        });
        return parsed;
      }
    }
  } catch (error) {
    console.error("Failed to load state from local storage", error);
    localStorage.removeItem('handwriting-app-state-v2');
  }

  // Create a fresh state if nothing is saved
  return {
    instances: SUBJECTS.reduce((acc, subject) => {
      acc[subject] = createInitialState();
      return acc;
    }, {} as Record<Subject, AppState>),
    activeSubject: 'Math',
    theme: 'light',
    controls: {
        position: { x: 20, y: 20 },
        size: { width: 340 },
    }
  };
};


const App: React.FC = () => {
  const [appData, setAppData] = useState<AppData>(getInitialAppData());
  const { activeSubject, theme, instances, controls } = appData;
  const activeInstanceState = instances[activeSubject];

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [language, setLanguage] = useState<Language>('english');
  const [answer, setAnswer] = useState<{title: string, content: string} | null>(null);
  const [isShapePaletteOpen, setIsShapePaletteOpen] = useState(false);
  
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem('handwriting-app-state-v2', JSON.stringify(appData));
    } catch (e) { console.error("Failed to save state to local storage", e); }
  }, [appData]);

  const setActiveInstanceState = useCallback((updater: (prevState: AppState) => AppState) => {
    setAppData(currentData => {
        const newInstanceState = updater(currentData.instances[currentData.activeSubject]);
        return {
            ...currentData,
            instances: {
                ...currentData.instances,
                [currentData.activeSubject]: newInstanceState,
            }
        };
    });
  }, []);

  const handleGetAnswer = useCallback(async (imageData: string, selectionBounds: any) => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
        const base64Data = imageData.split(',')[1];
        const result = await getAnswerFromImage(base64Data, activeInstanceState.answerLength);
        setAnswer({ title: "AI Answer", content: result });

    } catch (err) {
        console.error(err);
        setError('Failed to get an answer. Please try again.');
        setTimeout(() => setError(null), 5000);
    } finally {
        setIsLoading(false);
    }
  }, [isLoading, activeInstanceState.answerLength]);

  const setControlsState = (newControlsState: Partial<ControlsState>) => {
    setAppData(prev => ({...prev, controls: {...prev.controls, ...newControlsState}}));
  };
  
  const setTheme = (newTheme: Theme) => {
    setAppData(prev => ({...prev, theme: newTheme}));
  };
  
  const setActiveSubject = (subject: Subject) => {
    setAppData(prev => ({...prev, activeSubject: subject}));
  };

  const handleSetShapeType = (shapeType: ShapeType) => {
      setActiveInstanceState(s => ({
          ...s,
          toolSettings: {
              ...s.toolSettings,
              shape: { ...s.toolSettings.shape, type: shapeType },
          }
      }));
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden font-sans" style={{ backgroundColor: activeInstanceState.canvasStyle.backgroundColor }}>
      <EditorView
        key={activeSubject} // Force re-mount of editor on subject change
        instanceState={activeInstanceState}
        setInstanceState={setActiveInstanceState}
        tool={tool}
        language={language}
        onGetAnswer={handleGetAnswer}
        isLoading={isLoading}
        setIsLoading={setIsLoading}
        error={error}
        setError={setError}
      />
      
      <Controls
        tool={tool}
        setTool={setTool}
        language={language}
        setLanguage={setLanguage}
        instanceState={activeInstanceState}
        setInstanceState={setActiveInstanceState}
        isLoading={isLoading}
        error={error}
        theme={theme}
        setTheme={setTheme}
        activeSubject={activeSubject}
        setActiveSubject={setActiveSubject}
        subjects={SUBJECTS}
        controlsState={controls}
        setControlsState={setControlsState}
        onToggleShapePalette={() => setIsShapePaletteOpen(prev => !prev)}
      />

      {isShapePaletteOpen && (
          <ShapePalette
              activeShape={activeInstanceState.toolSettings.shape.type}
              onShapeSelect={handleSetShapeType}
              onClose={() => setIsShapePaletteOpen(false)}
          />
      )}

      {answer && (
        <AnswerModal 
          title={answer.title}
          content={answer.content}
          onClose={() => setAnswer(null)}
          theme={theme}
        />
      )}
    </div>
  );
};

export default App;