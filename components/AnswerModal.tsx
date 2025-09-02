import React from 'react';
import type { Theme } from '../App';
import { IconClose } from './Icons';

interface AnswerModalProps {
    title: string;
    content: string;
    onClose: () => void;
    theme: Theme;
}

export const AnswerModal: React.FC<AnswerModalProps> = ({ title, content, onClose, theme }) => {
    return (
        <div 
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" 
          aria-modal="true" 
          role="dialog"
          onClick={onClose}
        >
            <div 
              className="bg-card text-card-foreground p-6 rounded-xl shadow-2xl w-full max-w-md mx-auto border border-border flex flex-col"
              onClick={e => e.stopPropagation()} // Prevent closing when clicking inside modal
            >
                <header className="flex items-center justify-between pb-4 border-b border-border">
                    <h2 className="text-xl font-bold text-primary">{title}</h2>
                    <button 
                      onClick={onClose} 
                      className="p-1 rounded-full text-muted-foreground hover:bg-secondary hover:text-card-foreground transition-colors"
                      aria-label="Close"
                    >
                        <IconClose className="h-5 w-5" />
                    </button>
                </header>
                <div className="mt-4 max-h-[60vh] overflow-y-auto pr-2">
                    <p className="whitespace-pre-wrap">{content}</p>
                </div>
                <footer className="mt-6 flex justify-end">
                     <button 
                       onClick={onClose} 
                       className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary-hover transition-colors"
                     >
                       Close
                     </button>
                </footer>
            </div>
        </div>
    );
};