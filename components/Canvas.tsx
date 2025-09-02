import React, { useRef, useEffect, forwardRef, useCallback, useState } from 'react';
import type { RecognizedText, ViewTransform, CanvasStyle, Bounds, ToolSettings, ShapeType } from '../EditorView';
import type { Tool } from './Controls';
import { IconMagic } from './Icons';

export interface Point { x: number; y: number; }
export interface Stroke {
  id: number;
  points: Point[];
  tool: 'pen';
  strokeWidth: number;
  color: string;
}

interface CanvasProps {
  tool: Tool;
  toolSettings: ToolSettings;
  strokes: Stroke[];
  setStrokes: React.Dispatch<React.SetStateAction<Stroke[]>>;
  texts: RecognizedText[];
  viewTransform: ViewTransform;
  setViewTransform: React.Dispatch<React.SetStateAction<ViewTransform>>;
  canvasStyle: CanvasStyle;
  onRecognize: (imageData: string, bounds: Bounds) => void;
  onGetAnswer: (imageData: string, bounds: Bounds) => void;
  onItemsDelete: (ids: { strokeIds: number[], textIds: number[] }) => void;
  onTextUpdate: (id: number, newBounds: Bounds) => void;
  recognitionTrigger: number;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 5;
const PADDING = 40;

const getDistance = (p1: Point, p2: Point) => Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
const getMidpoint = (p1: Point, p2: Point) => ({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
const boundsIntersect = (b1: Bounds, b2: Bounds) => b1.x < b2.x + b2.width && b1.x + b1.width > b2.x && b1.y < b2.y + b2.height && b1.y + b1.height > b2.y;
const pointInBounds = (p: Point, b: Bounds) => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;

const createStrokesForShape = (start: Point, end: Point, type: ShapeType, strokeWidth: number, color: string): Stroke[] => {
    const idBase = Date.now();
    let points: Point[] = [];
    const { x: x1, y: y1 } = start;
    const { x: x2, y: y2 } = end;
    const width = x2 - x1;
    const height = y2 - y1;
    const cx = x1 + width / 2;
    const cy = y1 + height / 2;
    const rx = Math.abs(width) / 2;
    const ry = Math.abs(height) / 2;

    if (type === 'rectangle') {
        points.push({ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }, { x: x1, y: y1 });
    } else if (type === 'square') {
        const size = Math.max(Math.abs(width), Math.abs(height));
        const finalX2 = x1 + size * Math.sign(width || 1);
        const finalY2 = y1 + size * Math.sign(height || 1);
        points.push({ x: x1, y: y1 }, { x: finalX2, y: y1 }, { x: finalX2, y: finalY2 }, { x: x1, y: finalY2 }, { x: x1, y: y1 });
    } else if (type === 'circle' || type === 'oval') {
        const radiusX = rx;
        const radiusY = type === 'circle' ? rx : ry;
        if (radiusX < 1 || radiusY < 1) return [];
        const steps = Math.max(32, Math.floor(Math.PI * (radiusX+radiusY)) / 4);
        for (let i = 0; i <= steps; i++) {
            const angle = (i / steps) * 2 * Math.PI;
            points.push({ x: cx + radiusX * Math.cos(angle), y: cy + radiusY * Math.sin(angle) });
        }
    } else if (type === 'line') {
        points.push({ x: x1, y: y1 }, { x: x2, y: y2 });
    } else if (type === 'arrow') {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const arrowLength = Math.min(20, getDistance(start, end) / 3);
        const p1 = { x: x2, y: y2 };
        const p2 = { x: x2 - arrowLength * Math.cos(angle - Math.PI / 6), y: y2 - arrowLength * Math.sin(angle - Math.PI / 6) };
        const p3 = { x: x2 - arrowLength * Math.cos(angle + Math.PI / 6), y: y2 - arrowLength * Math.sin(angle + Math.PI / 6) };
        return [
            { id: idBase, points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], tool: 'pen', strokeWidth, color },
            { id: idBase + 1, points: [p2, p1, p3], tool: 'pen', strokeWidth, color }
        ];
    } else if (type === 'triangle') {
        const side = getDistance(start, end); if (side < 2) return [];
        const h = side * Math.sqrt(3) / 2;
        const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2;
        // FIX: Define dx and dy for triangle point calculation.
        const dx = x2 - x1;
        const dy = y2 - y1;
        const p3x = mx - h * (dy / side); const p3y = my + h * (dx / side);
        points.push({ x: x1, y: y1 }, { x: x2, y: y2 }, { x: p3x, y: p3y }, { x: x1, y: y1 });
    } else if (type === 'rightTriangle') {
        points.push({ x: x1, y: y1 }, { x: x1, y: y2 }, { x: x2, y: y2 }, { x: x1, y: y1 });
    } else if (['pentagon', 'hexagon', 'star', 'rhombus', 'parallelogram', 'trapezoid'].includes(type)) {
        const sides = {'pentagon': 5, 'hexagon': 6, 'star': 5, 'rhombus': 4, 'parallelogram': 4, 'trapezoid': 4}[type]!;
        const radius = Math.sqrt(rx*rx + ry*ry);
        if (radius < 2) return [];

        if (type === 'rhombus') {
            points.push({x: cx, y: y1}, {x: x2, y: cy}, {x: cx, y: y2}, {x: x1, y: cy}, {x: cx, y: y1});
        } else if (type === 'parallelogram') {
            const offset = rx * 0.25;
            points.push({x: x1 + offset, y: y1}, {x: x2 + offset, y: y1}, {x: x2 - offset, y: y2}, {x: x1 - offset, y: y2}, {x: x1 + offset, y: y1});
        } else if (type === 'trapezoid') {
            const offset = rx * 0.25;
            points.push({x: x1 + offset, y: y1}, {x: x2 - offset, y: y1}, {x: x2, y: y2}, {x: x1, y: y2}, {x: x1 + offset, y: y1});
        } else { // Regular polygons and star
            const angleOffset = -Math.PI / 2;
            for (let i = 0; i < sides * (type === 'star' ? 2 : 1); i++) {
                let r = radius;
                if (type === 'star') {
                    r = i % 2 === 0 ? radius : radius / 2.5;
                }
                const angle = angleOffset + (i / sides) * 2 * Math.PI;
                points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
            }
            points.push(points[0]);
        }
    } else if (type === 'cuboid') {
        if (Math.abs(width) < 5 || Math.abs(height) < 5) return [];
        const depthX = width * 0.4; const depthY = height * -0.4;
        const r1 = [ {x: x1, y: y1}, {x: x2, y: y1}, {x: x2, y: y2}, {x: x1, y: y2} ];
        const r2 = r1.map(p => ({ x: p.x + depthX, y: p.y + depthY }));
        return [
            { id: idBase, points: [...r1, r1[0]], tool: 'pen', strokeWidth, color },
            { id: idBase + 1, points: [...r2, r2[0]], tool: 'pen', strokeWidth, color },
            { id: idBase + 2, points: [r1[0], r2[0]], tool: 'pen', strokeWidth, color },
            { id: idBase + 3, points: [r1[1], r2[1]], tool: 'pen', strokeWidth, color },
            { id: idBase + 4, points: [r1[2], r2[2]], tool: 'pen', strokeWidth, color },
            { id: idBase + 5, points: [r1[3], r2[3]], tool: 'pen', strokeWidth, color },
        ];
    } else if (type === 'cone') {
        const radiusX = rx; const radiusY = Math.abs(height) * 0.2;
        const apex = { x: cx, y: y1 }; const baseCy = y2 - radiusY;
        if (radiusX < 1 || radiusY < 1) return [];
        const basePoints: Point[] = []; const steps = Math.max(32, Math.floor(Math.PI * (radiusX+radiusY)) / 4);
        for (let i = 0; i <= steps; i++) {
            const angle = (i / steps) * 2 * Math.PI;
            basePoints.push({ x: cx + radiusX * Math.cos(angle), y: baseCy + radiusY * Math.sin(angle) });
        }
        return [
            { id: idBase, points: basePoints, tool: 'pen', strokeWidth, color },
            { id: idBase + 1, points: [apex, {x: cx - radiusX, y: baseCy}], tool: 'pen', strokeWidth, color },
            { id: idBase + 2, points: [apex, {x: cx + radiusX, y: baseCy}], tool: 'pen', strokeWidth, color },
        ];
    } else if (type === 'pyramid') {
        if (Math.abs(width) < 5 || Math.abs(height) < 5) return [];
        const apex = { x: cx, y: y1 };
        const base = [ {x: x1, y: y2}, {x: x2, y: y2}, {x: x2 + rx*0.3, y: y2-ry*0.5}, {x: x1+rx*0.3, y:y2-ry*0.5} ];
        return [
            { id: idBase, points: [apex, base[0]], tool: 'pen', strokeWidth, color },
            { id: idBase + 1, points: [apex, base[1]], tool: 'pen', strokeWidth, color },
            { id: idBase + 2, points: [apex, base[3]], tool: 'pen', strokeWidth, color },
            { id: idBase + 3, points: [base[0], base[1]], tool: 'pen', strokeWidth, color },
            { id: idBase + 4, points: [base[0], base[3]], tool: 'pen', strokeWidth, color },
        ];
    } else if (type === 'cylinder') {
        if (rx < 1 || Math.abs(height) < 5) return [];
        const ryEllipse = Math.min(ry, rx * 0.3);
        const topEllipse: Point[] = [], bottomEllipse: Point[] = [];
        const steps = Math.max(32, Math.floor(Math.PI * (rx + ryEllipse)) / 4);
        for (let i = 0; i <= steps; i++) {
            const angle = (i / steps) * 2 * Math.PI;
            const px = cx + rx * Math.cos(angle);
            topEllipse.push({ x: px, y: y1 + ryEllipse * Math.sin(angle) });
            bottomEllipse.push({ x: px, y: y2 + ryEllipse * Math.sin(angle) });
        }
        return [
            { id: idBase, points: topEllipse, tool: 'pen', strokeWidth, color },
            { id: idBase + 1, points: bottomEllipse, tool: 'pen', strokeWidth, color },
            { id: idBase + 2, points: [{x: x1, y: y1+ryEllipse}, {x: x1, y: y2+ryEllipse}], tool: 'pen', strokeWidth, color },
            { id: idBase + 3, points: [{x: x2, y: y1+ryEllipse}, {x: x2, y: y2+ryEllipse}], tool: 'pen', strokeWidth, color },
        ];
    } else if (type === 'sphere') {
        if (rx < 2) return [];
        const circlePoints: Point[] = [], hEllipse: Point[] = [], vEllipse: Point[] = [];
        const steps = Math.max(32, Math.floor(Math.PI * (rx+ry)) / 4);
        for (let i = 0; i <= steps; i++) {
            const angle = (i / steps) * 2 * Math.PI;
            circlePoints.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
            hEllipse.push({ x: cx + rx * Math.cos(angle), y: cy + ry*0.3 * Math.sin(angle) });
            vEllipse.push({ x: cx + rx*0.3 * Math.cos(angle), y: cy + ry * Math.sin(angle) });
        }
        return [
             { id: idBase, points: circlePoints, tool: 'pen', strokeWidth, color },
             { id: idBase + 1, points: hEllipse, tool: 'pen', strokeWidth: strokeWidth*0.7, color },
             { id: idBase + 2, points: vEllipse, tool: 'pen', strokeWidth: strokeWidth*0.7, color },
        ];
    }

    if (points.length === 0) return [];
    return [{ id: idBase, points, tool: 'pen', strokeWidth, color }];
};

export const Canvas = forwardRef<HTMLCanvasElement, CanvasProps>(({
  tool, toolSettings, strokes, setStrokes, texts,
  viewTransform, setViewTransform, canvasStyle, onRecognize, onGetAnswer, onItemsDelete, onTextUpdate,
  recognitionTrigger
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  
  const pointers = useRef(new Map<number, Point>());
  const lastGesture = useRef<{ dist: number, mid: Point } | null>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const currentStrokePoints = useRef<Point[]>([]);
  const latestPointerPosition = useRef<Point>({ x: 0, y: 0 });

  const [draggedItem, setDraggedItem] = useState<{ id: number; initialBounds: Bounds; startPoint: Point } | null>(null);
  const [isHoveringText, setIsHoveringText] = useState(false);
  
  const [selectionRect, setSelectionRect] = useState<Bounds | null>(null);
  const selectionStartPoint = useRef<Point | null>(null);

  const [drawingShape, setDrawingShape] = useState<{ start: Point; end: Point } | null>(null);

  const getPointInWorldSpace = useCallback((e: { clientX: number, clientY: number }): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;

      const physicalX = cssX * dpr;
      const physicalY = cssY * dpr;

      const worldX = (physicalX - viewTransform.offsetX) / viewTransform.scale;
      const worldY = (physicalY - viewTransform.offsetY) / viewTransform.scale;
      
      return { x: worldX, y: worldY };
  }, [viewTransform]);

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Omit<Stroke, 'id'>) => {
    if (stroke.points.length < 1) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke.strokeWidth;
    ctx.strokeStyle = stroke.color;

    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }, []);

  const drawBackground = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    ctx.fillStyle = canvasStyle.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const { scale, offsetX, offsetY } = viewTransform;

    if (canvasStyle.backgroundType === 'plain') return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    if (canvasStyle.backgroundType === 'copybook') {
        const lineSpacing = 80 * scale; if (lineSpacing < 5) return;
        const startY = offsetY % lineSpacing;
        for (let y = startY - lineSpacing; y <= canvas.height + lineSpacing; y += lineSpacing) {
            ctx.strokeStyle = 'rgba(255, 128, 128, 0.4)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
            ctx.strokeStyle = 'rgba(128, 128, 255, 0.3)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(0, y + lineSpacing * 0.5 -2); ctx.lineTo(canvas.width, y + lineSpacing * 0.5 - 2); ctx.stroke();
        }
    } else if (canvasStyle.backgroundType === 'grid') {
        const gridSpacing = 50 * scale; if (gridSpacing < 5) return;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'; ctx.lineWidth = 1;
        const startX = offsetX % gridSpacing; const startY = offsetY % gridSpacing;
        for (let x = startX - gridSpacing; x <= canvas.width + gridSpacing; x += gridSpacing) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
        for (let y = startY - gridSpacing; y <= canvas.height + gridSpacing; y += gridSpacing) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
    } else if (canvasStyle.backgroundType === 'borderline') {
        const lineSpacing = 60 * scale; if (lineSpacing < 5) return;
        const startY = offsetY % lineSpacing;
        ctx.strokeStyle = 'rgba(0, 0, 255, 0.3)'; ctx.lineWidth = 1;
        for (let y = startY - lineSpacing; y <= canvas.height + lineSpacing; y += lineSpacing) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
        const marginX = 80 * scale + offsetX;
        if (marginX > -lineSpacing && marginX < canvas.width + lineSpacing) {
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.4)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(marginX, 0); ctx.lineTo(marginX, canvas.height); ctx.stroke();
        }
    }
    ctx.restore();
  }, [canvasStyle, viewTransform]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current; const context = contextRef.current; if (!canvas || !context) return;
    context.save(); 
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();

    drawBackground(context, canvas); 
    
    context.save(); 
    context.setTransform(viewTransform.scale, 0, 0, viewTransform.scale, viewTransform.offsetX, viewTransform.offsetY);
    
    strokes.forEach(stroke => drawStroke(context, stroke));
    
    if (currentStrokePoints.current.length > 0 && isDrawing && tool === 'pen') {
      const { size, color } = toolSettings.pen;
      drawStroke(context, { points: currentStrokePoints.current, tool: 'pen', strokeWidth: size, color });
    }
    
    if (isDrawing && tool === 'shape' && drawingShape) {
        const { type, size, color } = toolSettings.shape;
        const tempStrokes = createStrokesForShape(drawingShape.start, drawingShape.end, type, size, color);
        tempStrokes.forEach(stroke => drawStroke(context, stroke));
    }
    
    let draggedTextPosition: Point | null = null;
    if (draggedItem) {
        const currentPoint = latestPointerPosition.current;
        const dx = currentPoint.x - draggedItem.startPoint.x;
        const dy = currentPoint.y - draggedItem.startPoint.y;
        draggedTextPosition = { x: draggedItem.initialBounds.x + dx, y: draggedItem.initialBounds.y + dy };
    }

    texts.forEach(textItem => {
      let bounds = textItem.bounds;
      if (draggedItem && draggedItem.id === textItem.id && draggedTextPosition) {
         bounds = { ...bounds, x: draggedTextPosition.x, y: draggedTextPosition.y };
      }
      context.fillStyle = '#1e293b';
      context.font = `bold ${textItem.fontSize}px "${textItem.fontFamily}", cursive`;
      const lines = textItem.text.split('\n'); let y = bounds.y + textItem.fontSize;
      lines.forEach(line => { context.fillText(line, bounds.x, y); y += textItem.fontSize * 1.2; });
    });

    if (selectionRect) {
        context.fillStyle = 'rgba(0, 120, 255, 0.1)';
        context.fillRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height);
        context.strokeStyle = 'rgba(0, 120, 255, 0.8)';
        context.lineWidth = 2 / viewTransform.scale;
        context.setLineDash([6 / viewTransform.scale, 4 / viewTransform.scale]);
        context.strokeRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height);
        context.setLineDash([]);
    }

    context.restore();
  }, [strokes, texts, viewTransform, drawBackground, tool, toolSettings, drawStroke, draggedItem, selectionRect, isDrawing, drawingShape]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    contextRef.current = canvas.getContext('2d', { willReadFrequently: true });
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1; const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
      redrawCanvas();
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [redrawCanvas]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);
  
  useEffect(() => {
    if (recognitionTrigger > 0 && strokes.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      strokes.forEach(stroke => {
        const r = stroke.strokeWidth / 2;
        stroke.points.forEach(p => {
            minX = Math.min(minX, p.x - r); minY = Math.min(minY, p.y - r);
            maxX = Math.max(maxX, p.x + r); maxY = Math.max(maxY, p.y + r);
        });
      });
      
      if (minX === Infinity) return;

      const bounds: Bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      
      if (bounds.width <= 0 || bounds.height <= 0) return;

      const tempCanvas = document.createElement('canvas');
      const PADDED_WIDTH = bounds.width + PADDING * 2; const PADDED_HEIGHT = bounds.height + PADDING * 2;
      tempCanvas.width = PADDED_WIDTH; tempCanvas.height = PADDED_HEIGHT;
      const tempCtx = tempCanvas.getContext('2d');

      if (tempCtx) {
        tempCtx.fillStyle = canvasStyle.backgroundColor; tempCtx.fillRect(0, 0, PADDED_WIDTH, PADDED_HEIGHT);
        
        const strokesToDraw = strokes.map(stroke => ({
          ...stroke, points: stroke.points.map(p => ({ x: p.x - bounds.x + PADDING, y: p.y - bounds.y + PADDING }))
        }));
        strokesToDraw.forEach(stroke => drawStroke(tempCtx, stroke));
        const imageData = tempCanvas.toDataURL('image/png'); onRecognize(imageData, bounds);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recognitionTrigger]);

  const eraseAtPoint = useCallback((point: Point) => {
    const { size } = toolSettings.eraser;
    const eraserRadius = size / 2;
    const strokeIdsToDelete: Set<number> = new Set();
    const textIdsToDelete: Set<number> = new Set();

    strokes.forEach(stroke => {
        const strokeWidth = stroke.strokeWidth / 2;
        if (stroke.points.some(p => getDistance(p, point) < eraserRadius + strokeWidth)) { strokeIdsToDelete.add(stroke.id); }
    });

    texts.forEach(text => {
        const { x, y, width, height } = text.bounds;
        if (point.x > x - eraserRadius && point.x < x + width + eraserRadius && point.y > y - eraserRadius && point.y < y + height + eraserRadius) {
            textIdsToDelete.add(text.id);
        }
    });

    if (strokeIdsToDelete.size > 0 || textIdsToDelete.size > 0) {
        onItemsDelete({ strokeIds: Array.from(strokeIdsToDelete), textIds: Array.from(textIdsToDelete) });
    }
  }, [onItemsDelete, strokes, texts, toolSettings.eraser]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
    const point = getPointInWorldSpace(e);
    latestPointerPosition.current = point;
    
    if (pointers.current.size === 1) {
        setSelectionRect(null); // Clear selection on new interaction
        if (tool === 'hand') {
            const textToDrag = [...texts].reverse().find(t => pointInBounds(point, t.bounds));
            if (textToDrag) {
                setDraggedItem({ id: textToDrag.id, initialBounds: textToDrag.bounds, startPoint: point });
                return;
            }
        }
        
        if (tool === 'pen') { setIsDrawing(true); currentStrokePoints.current = [point]; } 
        else if (tool === 'eraser') { eraseAtPoint(point); } 
        else if (tool === 'select') { selectionStartPoint.current = point; }
        else if (tool === 'shape') {
            setIsDrawing(true);
            setDrawingShape({ start: point, end: point });
        }
    }
    if (pointers.current.size === 2) {
        const [p1, p2] = Array.from(pointers.current.values());
        lastGesture.current = { dist: getDistance(p1, p2), mid: getMidpoint(p1, p2) };
    }
  };
  
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getPointInWorldSpace(e);
    latestPointerPosition.current = point;
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (draggedItem) { redrawCanvas(); return; }

    if (pointers.current.size === 1) {
        if (!isDrawing && tool === 'hand') {
            const isOverText = texts.some(t => pointInBounds(point, t.bounds)); setIsHoveringText(isOverText);
        } else if (isHoveringText) { setIsHoveringText(false); }

        if (isDrawing && tool === 'pen') { currentStrokePoints.current.push(point); redrawCanvas(); } 
        else if (isDrawing && tool === 'shape') {
            setDrawingShape(prev => prev ? { ...prev, end: point } : null);
        }
        else if (tool === 'eraser') { eraseAtPoint(point); }
        else if (tool === 'hand' && !draggedItem) {
            const p = Array.from(pointers.current.values())[0];
            const lastP = { x: e.clientX - e.movementX, y: e.clientY - e.movementY };
            const dpr = window.devicePixelRatio || 1;
            const dx = (p.x - lastP.x) * dpr; const dy = (p.y - lastP.y) * dpr;
            setViewTransform(prev => ({ ...prev, offsetX: prev.offsetX + dx, offsetY: prev.offsetY + dy }));
        }
        else if (tool === 'select' && selectionStartPoint.current) {
            const start = selectionStartPoint.current;
            const x = Math.min(start.x, point.x); const y = Math.min(start.y, point.y);
            const width = Math.abs(start.x - point.x); const height = Math.abs(start.y - point.y);
            setSelectionRect({ x, y, width, height });
        }
    } else if (pointers.current.size === 2 && lastGesture.current) {
        const [p1, p2] = Array.from(pointers.current.values());
        const currentDist = getDistance(p1, p2);
        const currentMid = getMidpoint(p1, p2);
        const dpr = window.devicePixelRatio || 1;

        // Zoom
        const scaleFactor = currentDist / lastGesture.current.dist;
        const newScale = Math.min(Math.max(viewTransform.scale * scaleFactor, MIN_ZOOM), MAX_ZOOM);
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const physicalX = (currentMid.x - rect.left) * dpr;
        const physicalY = (currentMid.y - rect.top) * dpr;

        const newOffsetX = physicalX - (physicalX - viewTransform.offsetX) * (newScale / viewTransform.scale);
        const newOffsetY = physicalY - (physicalY - viewTransform.offsetY) * (newScale / viewTransform.scale);

        // Pan
        const panDX = (currentMid.x - lastGesture.current.mid.x) * dpr;
        const panDY = (currentMid.y - lastGesture.current.mid.y) * dpr;

        setViewTransform({
            scale: newScale,
            offsetX: newOffsetX + panDX,
            offsetY: newOffsetY + panDY
        });

        lastGesture.current = { dist: currentDist, mid: currentMid };
    }
  };
  
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    pointers.current.delete(e.pointerId);
    lastGesture.current = null;
    setIsDrawing(false);

    if (draggedItem) {
        const text = texts.find(t => t.id === draggedItem.id);
        if (text) {
            const currentPoint = getPointInWorldSpace(e);
            const dx = currentPoint.x - draggedItem.startPoint.x; const dy = currentPoint.y - draggedItem.startPoint.y;
            let newBounds = { ...draggedItem.initialBounds, x: draggedItem.initialBounds.x + dx, y: draggedItem.initialBounds.y + dy };
            if (canvasStyle.backgroundType === 'copybook') {
                const lineSpacing = 80; const { fontSize } = text;
                const newBaselineY = newBounds.y + fontSize;
                const nearestLineY = Math.round(newBaselineY / lineSpacing) * lineSpacing;
                newBounds.y = nearestLineY - fontSize;
            }
            onTextUpdate(draggedItem.id, newBounds);
        }
        setDraggedItem(null);
    }
    
    if (tool === 'pen' && currentStrokePoints.current.length > 1) {
        const { size, color } = toolSettings.pen;
        const newStroke: Stroke = { id: Date.now(), points: currentStrokePoints.current, tool: 'pen', strokeWidth: size, color };
        setStrokes(prev => [...prev, newStroke]);
    }
    currentStrokePoints.current = [];
    
    if (tool === 'shape' && drawingShape) {
        const { type, size, color } = toolSettings.shape;
        const newStrokes = createStrokesForShape(drawingShape.start, drawingShape.end, type, size, color);
        if (newStrokes.length > 0) {
            setStrokes(prev => [...prev, ...newStrokes]);
        }
        setDrawingShape(null);
    }

    if (tool === 'select') {
        selectionStartPoint.current = null;
        if (selectionRect && (selectionRect.width < 10 || selectionRect.height < 10)) { setSelectionRect(null); }
    }
  };
  
  const handleAnswerButtonClick = () => {
    if (!selectionRect) return;

    const tempCanvas = document.createElement('canvas');
    const PADDED_WIDTH = selectionRect.width + PADDING * 2;
    const PADDED_HEIGHT = selectionRect.height + PADDING * 2;
    tempCanvas.width = PADDED_WIDTH; tempCanvas.height = PADDED_HEIGHT;
    const tempCtx = tempCanvas.getContext('2d');

    if (tempCtx) {
        tempCtx.fillStyle = canvasStyle.backgroundColor;
        tempCtx.fillRect(0, 0, PADDED_WIDTH, PADDED_HEIGHT);

        const strokesToDraw = strokes
            .filter(s => s.points.some(p => pointInBounds(p, selectionRect)))
            .map(s => ({ ...s, points: s.points.map(p => ({ x: p.x - selectionRect.x + PADDING, y: p.y - selectionRect.y + PADDING })) }));
        strokesToDraw.forEach(s => drawStroke(tempCtx, s));
        
        const textsToDraw = texts
            .filter(t => boundsIntersect(t.bounds, selectionRect))
            .map(t => ({ ...t, bounds: { ...t.bounds, x: t.bounds.x - selectionRect.x + PADDING, y: t.bounds.y - selectionRect.y + PADDING } }));
            
        textsToDraw.forEach(textItem => {
          tempCtx.fillStyle = '#1e293b';
          tempCtx.font = `bold ${textItem.fontSize}px "${textItem.fontFamily}", cursive`;
          const lines = textItem.text.split('\n'); let y = textItem.bounds.y + textItem.fontSize;
          lines.forEach(line => { tempCtx.fillText(line, textItem.bounds.x, y); y += textItem.fontSize * 1.2; });
        });

        const imageData = tempCanvas.toDataURL('image/png');
        onGetAnswer(imageData, selectionRect);
        setSelectionRect(null);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const physicalX = (e.clientX - rect.left) * dpr; const physicalY = (e.clientY - rect.top) * dpr;
    const scroll = e.deltaY * -0.005;
    const newScale = Math.min(Math.max(viewTransform.scale * (1 + scroll), MIN_ZOOM), MAX_ZOOM);
    const zoomFactor = newScale / viewTransform.scale;
    const newOffsetX = physicalX - (physicalX - viewTransform.offsetX) * zoomFactor;
    const newOffsetY = physicalY - (physicalY - viewTransform.offsetY) * zoomFactor;
    setViewTransform({ scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY });
  };
  
  const getCursorStyle = () => {
    if (tool === 'hand') {
        if (pointers.current.size > 0 && !draggedItem) return 'grabbing';
        if (isHoveringText || draggedItem) return 'move';
        return 'grab';
    }
    if (tool === 'select' || tool === 'shape') return 'crosshair';
    if (pointers.current.size > 0) return 'none'; // Hide cursor while drawing
    return 'default'; // Or a custom cursor preview
  };

  const getAnswerButtonPosition = () => {
      if (!canvasRef.current || !selectionRect) return { display: 'none' };
      const dpr = window.devicePixelRatio || 1;
      const physicalX = (selectionRect.x + selectionRect.width) * viewTransform.scale + viewTransform.offsetX;
      const physicalY = (selectionRect.y + selectionRect.height) * viewTransform.scale + viewTransform.offsetY;
      return {
          position: 'absolute' as const,
          left: `${physicalX / dpr}px`,
          top: `${physicalY / dpr}px`,
          transform: 'translate(-100%, 0)',
          marginTop: '8px'
      };
  };

  return (
    <div className="absolute top-0 left-0 w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none"
        style={{ backgroundColor: canvasStyle.backgroundColor, cursor: getCursorStyle() }}
        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
        onPointerLeave={(e) => { 
          pointers.current.delete(e.pointerId);
          if (isDrawing) { handlePointerUp(e); }
          setIsHoveringText(false);
        }}
        onWheel={handleWheel}
      />
      {selectionRect && (
          <button
            onClick={handleAnswerButtonClick}
            style={getAnswerButtonPosition()}
            className="z-10 flex items-center justify-center px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
          >
            <IconMagic className="mr-2 h-5 w-5" />
            Ans
          </button>
      )}
    </div>
  );
});