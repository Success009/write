import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Language, BackgroundType, Theme, Subject, ControlsState } from '../App';
import type { AppState, CanvasStyle, ShapeType } from '../EditorView';
import { IconMagic, IconTrash, IconLoader, IconPen, IconEraser, IconResetSettings, IconUndo, IconRedo, IconHand, IconSelect, IconSun, IconMoon, IconBook, IconTool, IconPalette, IconResize, IconShape } from './Icons';
import type { AnswerLength } from '../services/geminiService';

export type Tool = 'pen' | 'eraser' | 'hand' | 'select' | 'shape';

interface ControlsProps {
  tool: Tool;
  setTool: (tool: Tool) => void;
  language: Language;
  setLanguage: (language: Language) => void;
  instanceState: AppState;
  setInstanceState: (updater: (prevState: AppState) => AppState) => void;
  isLoading: boolean;
  error: string | null;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  activeSubject: Subject;
  setActiveSubject: (subject: Subject) => void;
  subjects: Subject[];
  controlsState: ControlsState;
  setControlsState: (newState: Partial<ControlsState>) => void;
  onToggleShapePalette: () => void;
}

type Tab = 'Subjects' | 'Tools' | 'Style';

const FONT_FACES = ['Caveat', 'Roboto', 'Lora', 'Patrick Hand', 'Indie Flower', 'Dancing Script', 'Kalam'];
const BACKGROUND_TYPES: { id: BackgroundType, name: string }[] = [
    { id: 'copybook', name: 'Copybook' }, { id: 'grid', name: 'Grid' },
    { id: 'borderline', name: 'Borderline' }, { id: 'plain', name: 'Plain' },
];

const Section: React.FC<{title: string, children: React.ReactNode}> = ({ title, children }) => (
    <div className="flex flex-col space-y-3">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">{title}</h3>
        <div className="flex flex-col space-y-4">{children}</div>
    </div>
);

const LabeledControl: React.FC<{label: string, children: React.ReactNode}> = ({ label, children }) => (
    <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-card-foreground">{label}</label>
        {children}
    </div>
);

export const Controls: React.FC<ControlsProps> = ({
  tool, setTool, language, setLanguage, instanceState, setInstanceState,
  isLoading, error, theme, setTheme, activeSubject, setActiveSubject, subjects,
  controlsState, setControlsState, onToggleShapePalette
}) => {
  const { toolSettings, canvasStyle, isGlobalStyleEnabled, isSpellingCorrectionEnabled, answerLength, pages, currentPageIndex } = instanceState;
  const currentPage = pages[currentPageIndex];
  
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);
  const offset = useRef({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState<Tab>('Tools');

  const [, forceUpdate] = useState(0);
  useEffect(() => {
    (window as any)._reRenderControls = () => forceUpdate(c => c + 1);
    if ((window as any).editorViewControls) forceUpdate(c => c + 1);
    return () => { delete (window as any)._reRenderControls; };
  }, []);

  const { undo, redo, canUndo, canRedo, handleRecognize, requestClear, requestReset, setState: editorSetState } = (window as any).editorViewControls || {};

  const handleDragDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      const target = e.target as HTMLElement;
      if (target.closest('button, input, select, label, .resize-handle')) return;
      offset.current = { x: e.clientX - controlsState.position.x, y: e.clientY - controlsState.position.y };
      setIsDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };
  
  const handleResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
      setIsResizing(true);
      e.currentTarget.setPointerCapture(e.pointerId);
  };
  
  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (isDragging) {
      setControlsState({ position: { x: e.clientX - offset.current.x, y: e.clientY - offset.current.y } });
    }
    if (isResizing) {
        setControlsState({ size: { width: controlsState.size.width + e.movementX }});
    }
  }, [isDragging, isResizing, controlsState.size.width, setControlsState]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, isResizing, handlePointerMove, handlePointerUp]);

  const handleSetToolSettings = (newSettings: Partial<typeof toolSettings>) => {
     editorSetState?.(s => ({ ...s, toolSettings: { ...s.toolSettings, ...newSettings } }));
  };
  const handleSetCanvasStyle = (newStyle: Partial<CanvasStyle>) => {
     editorSetState?.(s => ({ ...s, canvasStyle: { ...s.canvasStyle, ...newStyle } }));
  };
  const setIsGlobalStyleEnabled = (enabled: boolean) => editorSetState?.(s => ({ ...s, isGlobalStyleEnabled: enabled }));
  const setIsSpellingCorrectionEnabled = (enabled: boolean) => editorSetState?.(s => ({ ...s, isSpellingCorrectionEnabled: enabled }));
  const setAnswerLength = (length: AnswerLength) => editorSetState?.(s => ({ ...s, answerLength: length }));

  const handleSizeChange = (size: number) => {
    if (tool === 'pen' || tool === 'eraser' || tool === 'shape') {
      const settings = tool === 'shape' ? toolSettings.shape : toolSettings[tool];
      handleSetToolSettings({ [tool]: { ...settings, size } });
    }
  };

  const handleColorChange = (color: string) => {
      if (tool === 'pen' || tool === 'shape') {
        const settings = tool === 'shape' ? toolSettings.shape : toolSettings[tool];
        handleSetToolSettings({ [tool]: { ...settings, color } });
      }
  }

  const handleShapeToolClick = () => {
    setTool('shape');
    onToggleShapePalette();
  };

  const currentSize = (tool === 'pen' || tool === 'eraser') ? toolSettings[tool].size : tool === 'shape' ? toolSettings.shape.size : 0;
  const currentColor = tool === 'pen' ? toolSettings.pen.color : tool === 'shape' ? toolSettings.shape.color : '';

  const tabButtonClasses = (tabName: Tab) => `flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-card rounded-t-lg ${activeTab === tabName ? 'bg-card text-primary' : 'bg-secondary text-muted-foreground hover:bg-accent'}`;
  const toolButtonClasses = (buttonTool: Tool) => `p-2 rounded-md transition-colors ${tool === buttonTool ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-accent text-secondary-foreground'}`;
  const actionButtonClasses = "p-2 rounded-lg bg-secondary hover:bg-accent text-secondary-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  const renderToolOptions = () => {
      if (tool !== 'pen' && tool !== 'eraser' && tool !== 'shape') return null;
      return (
        <div className="flex flex-col space-y-4">
            <LabeledControl label="Size">
                <div className="flex items-center space-x-2 w-2/3">
                    <input type="range" min="2" max={tool === 'eraser' ? 150 : 50} value={currentSize} onChange={(e) => handleSizeChange(Number(e.target.value))} className="w-full"/>
                    <span className="text-sm font-mono w-8 text-right">{currentSize}</span>
                </div>
            </LabeledControl>
            {(tool === 'pen' || tool === 'shape') && (
                <LabeledControl label="Color">
                    <div className="relative">
                        <input type="color" value={currentColor} onChange={e => handleColorChange(e.target.value)} 
                               className="w-8 h-8 p-0 border-none bg-transparent appearance-none cursor-pointer" style={{'--color': currentColor} as any} />
                    </div>
                </LabeledControl>
            )}
        </div>
      );
  }

  return (
    <div
      ref={dragRef}
      className="fixed flex flex-col bg-card rounded-xl shadow-2xl select-none text-card-foreground border border-border"
      style={{ top: controlsState.position.y, left: controlsState.position.x, width: `${controlsState.size.width}px` }}
      onPointerDown={handleDragDown}
    >
      <header className={`flex border-b border-border p-1 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}>
        <button onClick={() => setActiveTab('Subjects')} className={tabButtonClasses('Subjects')}><IconBook className="h-4 w-4"/>Subjects</button>
        <button onClick={() => setActiveTab('Tools')} className={tabButtonClasses('Tools')}><IconTool className="h-4 w-4"/>Tools</button>
        <button onClick={() => setActiveTab('Style')} className={tabButtonClasses('Style')}><IconPalette className="h-4 w-4"/>Style</button>
      </header>

      <div className="p-4 flex flex-col space-y-4 flex-grow overflow-y-auto">
        {activeTab === 'Subjects' && (
           <Section title="Select a Subject">
                <div className="grid grid-cols-2 gap-2">
                    {subjects.map(s => (
                        <button key={s} onClick={() => setActiveSubject(s)}
                            className={`px-3 py-2 text-sm rounded-md transition-colors ${activeSubject === s ? 'bg-primary text-primary-foreground font-semibold' : 'bg-secondary hover:bg-accent text-secondary-foreground'}`}>{s}</button>
                    ))}
                </div>
            </Section>
        )}
        
        {activeTab === 'Tools' && (
          <div className="flex flex-col space-y-6">
            <Section title="Tools">
                <div className="grid grid-cols-5 gap-2">
                    <button onClick={() => setTool('pen')} className={toolButtonClasses('pen')} title="Pen"><IconPen className="w-5 h-5 mx-auto" /></button>
                    <button onClick={() => setTool('eraser')} className={toolButtonClasses('eraser')} title="Eraser"><IconEraser className="w-5 h-5 mx-auto" /></button>
                    <button onClick={() => setTool('hand')} className={toolButtonClasses('hand')} title="Pan"><IconHand className="w-5 h-5 mx-auto" /></button>
                    <button onClick={() => setTool('select')} className={toolButtonClasses('select')} title="Select"><IconSelect className="w-5 h-5 mx-auto" /></button>
                    <button onClick={handleShapeToolClick} className={toolButtonClasses('shape')} title="Shape"><IconShape className="w-5 h-5 mx-auto" /></button>
                </div>
                {renderToolOptions()}
            </Section>
            <Section title="AI Settings">
                 <LabeledControl label="Language">
                    <div className="flex space-x-2">
                        <button onClick={() => setLanguage('english')} className={`px-3 py-1 text-xs rounded-md transition-colors ${language === 'english' ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-accent'}`}>English</button>
                        <button onClick={() => setLanguage('nepali')} className={`px-3 py-1 text-xs rounded-md transition-colors ${language === 'nepali' ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-accent'}`}>Nepali</button>
                    </div>
                </LabeledControl>
                 <LabeledControl label="Answer Length">
                    <select value={answerLength} onChange={e => setAnswerLength(e.target.value as AnswerLength)} className="p-1 text-sm rounded-md bg-secondary border border-border">
                        <option value="compact">Compact</option>
                        <option value="medium">Medium</option>
                        <option value="detailed">Detailed</option>
                    </select>
                </LabeledControl>
                 <LabeledControl label="Spelling Correction">
                    <button onClick={() => setIsSpellingCorrectionEnabled(!isSpellingCorrectionEnabled)} className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${isSpellingCorrectionEnabled ? 'bg-primary' : 'bg-secondary'}`}>
                        <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${isSpellingCorrectionEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </LabeledControl>
            </Section>
          </div>
        )}

        {activeTab === 'Style' && (
          <div className="flex flex-col space-y-6">
            <Section title="Canvas">
                <LabeledControl label="Background">
                    <select value={canvasStyle.backgroundType} onChange={e => handleSetCanvasStyle({backgroundType: e.target.value as BackgroundType})} className="p-1 text-sm rounded-md bg-secondary border border-border">
                        {BACKGROUND_TYPES.map(bg => <option key={bg.id} value={bg.id}>{bg.name}</option>)}
                    </select>
                </LabeledControl>
                <LabeledControl label="BG Color">
                    <input type="color" value={canvasStyle.backgroundColor} onChange={e => handleSetCanvasStyle({backgroundColor: e.target.value})} className="w-8 h-8 p-0 border-none bg-transparent appearance-none cursor-pointer" />
                </LabeledControl>
            </Section>
            <Section title="Text">
                <LabeledControl label="Font">
                    <select value={canvasStyle.fontFamily} onChange={e => handleSetCanvasStyle({fontFamily: e.target.value})} className="p-1 text-sm rounded-md bg-secondary border border-border">
                        {FONT_FACES.map(font => <option key={font} value={font} style={{fontFamily: `var(--font-handwriting-${font.toLowerCase().replace(' ','-')})`}}>{font}</option>)}
                    </select>
                </LabeledControl>
                <LabeledControl label="Font Size">
                    <div className="flex items-center space-x-2 w-2/3">
                        <input type="range" min="20" max="100" value={canvasStyle.fontSize} onChange={(e) => handleSetCanvasStyle({fontSize: Number(e.target.value)})} className="w-full"/>
                        <span className="text-sm font-mono w-6 text-right">{canvasStyle.fontSize}</span>
                    </div>
                </LabeledControl>
                <LabeledControl label="Apply to all text">
                    <button onClick={() => setIsGlobalStyleEnabled(!isGlobalStyleEnabled)} className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${isGlobalStyleEnabled ? 'bg-primary' : 'bg-secondary'}`}>
                        <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${isGlobalStyleEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </LabeledControl>
            </Section>
          </div>
        )}
      </div>

      <footer className="border-t border-border p-3 space-y-3">
        <div className="grid grid-cols-5 gap-2">
           <button onClick={undo} disabled={!canUndo} title="Undo" className={actionButtonClasses}><IconUndo className="h-5 w-5 m-auto" /></button>
           <button onClick={redo} disabled={!canRedo} title="Redo" className={actionButtonClasses}><IconRedo className="h-5 w-5 m-auto" /></button>
           <button onClick={requestReset} title="Reset Settings" className={actionButtonClasses}><IconResetSettings className="h-5 w-5 m-auto" /></button>
           <button onClick={requestClear} disabled={isLoading} className="p-2 rounded-lg border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><IconTrash className="h-5 w-5 m-auto" /></button>
           <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Toggle Theme" className={actionButtonClasses}>
              {theme === 'light' ? <IconMoon className="h-5 w-5 m-auto"/> : <IconSun className="h-5 w-5 m-auto" />}
           </button>
        </div>
        <button onClick={handleRecognize} disabled={isLoading || currentPage.strokes.length === 0} className="w-full flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg shadow-sm hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {isLoading ? (<><IconLoader className="animate-spin -ml-1 mr-3 h-5 w-5" /> Working...</>) : (<><IconMagic className="-ml-1 mr-2 h-5 w-5" /> Recognize</>)}
        </button>
        {error && <p className="text-xs text-destructive text-center">{error}</p>}
      </footer>
      <div className="resize-handle absolute bottom-0 right-0 cursor-nwse-resize p-2 text-muted-foreground/50 hover:text-muted-foreground" onPointerDown={handleResizeDown}>
        <IconResize />
      </div>
    </div>
  );
};