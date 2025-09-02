import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ShapeType } from '../EditorView';
import {
    IconRectangle, IconSquare, IconCircle, IconOval, IconCuboid, IconCone, IconPyramid,
    IconLine, IconArrow, IconTriangle, IconRightTriangle, IconRhombus, IconParallelogram,
    IconTrapezoid, IconPentagon, IconHexagon, IconStar, IconCylinder, IconSphere, IconClose
} from './Icons';

interface ShapePaletteProps {
    activeShape: ShapeType;
    onShapeSelect: (shape: ShapeType) => void;
    onClose: () => void;
}

const SHAPE_CATEGORIES = [
    {
        name: 'Lines & Arrows',
        shapes: [
            { id: 'line', name: 'Line', icon: IconLine },
            { id: 'arrow', name: 'Arrow', icon: IconArrow },
        ]
    },
    {
        name: '2D Shapes',
        shapes: [
            { id: 'rectangle', name: 'Rectangle', icon: IconRectangle },
            { id: 'square', name: 'Square', icon: IconSquare },
            { id: 'circle', name: 'Circle', icon: IconCircle },
            { id: 'oval', name: 'Oval', icon: IconOval },
            { id: 'triangle', name: 'Triangle', icon: IconTriangle },
            { id: 'rightTriangle', name: 'Right Triangle', icon: IconRightTriangle },
            { id: 'rhombus', name: 'Rhombus', icon: IconRhombus },
            { id: 'parallelogram', name: 'Parallelogram', icon: IconParallelogram },
            { id: 'trapezoid', name: 'Trapezoid', icon: IconTrapezoid },
        ]
    },
    {
        name: 'Polygons',
        shapes: [
            { id: 'pentagon', name: 'Pentagon', icon: IconPentagon },
            { id: 'hexagon', name: 'Hexagon', icon: IconHexagon },
            { id: 'star', name: 'Star', icon: IconStar },
        ]
    },
    {
        name: '3D Shapes',
        shapes: [
            { id: 'cuboid', name: 'Cuboid', icon: IconCuboid },
            { id: 'cone', name: 'Cone', icon: IconCone },
            { id: 'pyramid', name: 'Pyramid', icon: IconPyramid },
            { id: 'cylinder', name: 'Cylinder', icon: IconCylinder },
            { id: 'sphere', name: 'Sphere', icon: IconSphere },
        ]
    },
];


const Section: React.FC<{title: string, children: React.ReactNode}> = ({ title, children }) => (
    <div className="flex flex-col space-y-3">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">{title}</h3>
        {children}
    </div>
);

export const ShapePalette: React.FC<ShapePaletteProps> = ({ activeShape, onShapeSelect, onClose }) => {
    const [position, setPosition] = useState({ x: window.innerWidth - 300, y: 80 });
    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef<HTMLDivElement>(null);
    const offset = useRef({ x: 0, y: 0 });

    const handleDragDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (dragRef.current) {
            const target = e.target as HTMLElement;
            if (target.closest('button')) return;
            offset.current = { x: e.clientX - position.x, y: e.clientY - position.y };
            setIsDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
        }
    };

    const handlePointerMove = useCallback((e: PointerEvent) => {
        if (isDragging) {
            setPosition({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y });
        }
    }, [isDragging]);

    const handlePointerUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
        }
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [isDragging, handlePointerMove, handlePointerUp]);

    const shapeButtonClasses = (shapeType: ShapeType) => `p-2 rounded-md transition-colors ${activeShape === shapeType ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-accent text-secondary-foreground'}`;

    return (
        <div
            ref={dragRef}
            className="fixed flex flex-col bg-card rounded-xl shadow-2xl select-none text-card-foreground border border-border w-64 z-20"
            style={{ top: position.y, left: position.x }}
            onPointerDown={handleDragDown}
        >
            <header className={`flex items-center justify-between border-b border-border p-2 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}>
                <h2 className="text-sm font-bold ml-2">Shape Library</h2>
                 <button onClick={onClose} className="p-1 rounded-full hover:bg-secondary transition-colors" aria-label="Close Shape Palette">
                    <IconClose className="w-4 h-4" />
                 </button>
            </header>

            <div className="p-4 flex flex-col space-y-4 max-h-[60vh] overflow-y-auto">
                {SHAPE_CATEGORIES.map(category => (
                    <Section key={category.name} title={category.name}>
                        <div className="grid grid-cols-4 gap-2">
                            {category.shapes.map(({ id, name, icon: Icon }) => (
                                <button
                                    key={id}
                                    onClick={() => onShapeSelect(id as ShapeType)}
                                    className={shapeButtonClasses(id as ShapeType)}
                                    title={name}
                                >
                                    <Icon className="w-5 h-5 mx-auto" />
                                </button>
                            ))}
                        </div>
                    </Section>
                ))}
            </div>
        </div>
    );
};