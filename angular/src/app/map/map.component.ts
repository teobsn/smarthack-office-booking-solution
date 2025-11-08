import { Component, HostListener, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css']
})
export class MapComponent implements OnInit, AfterViewInit {

  // --- PUBLIC PROPERTIES (Template Bindings) ---
  public initialViewBox = '-463/2 -1355/2 463/2 1355/2';
  public transform: string;

  // --- PRIVATE STATE ---
  private currentScale = 1;
  private currentTranslateX = 0;
  private currentTranslateY = 0;
  private isPanning = false;
  private isPinching = false;

  // Track if we're over an interactive rectangle to prevent panning
  private isOverInteractive = false;

  private startPanX = 0;
  private startPanY = 0;
  private lastTouchDistance = 0; // For pinch zoom

  private mapWidth = 463;
  private mapHeight = 1355;

  private borderMargin = 0;
  private centerSVG: { x: number, y: number } = { x: 0, y: 0 }; // Zoom center point

  constructor(
  ) {
    this.transform = this.updateTransform();
  }

  ngOnInit(): void {
  }

  ngAfterViewInit(): void {
    // Initial positioning and clamping
    this.clampTranslation(document.querySelector('.map-container')?.getBoundingClientRect());
    this.transform = this.updateTransform();
  }

  // --- 1. MOUSE PANNING/ZOOMING ---

  public onWheel(event: WheelEvent): void {
    event.preventDefault();

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const oldScale = this.currentScale;

    // If ctrlKey is pressed we treat this as touchpad pinch/zoom and apply
    // smooth exponential scaling. Otherwise treat as scroll/pan.
    if (event.ctrlKey) {
      // tuning constant for smoothness; smaller -> slower smoother zoom
      const k = 0.005;
      const scaleFactor = Math.exp(-event.deltaY * k);
      let newScale = oldScale * scaleFactor;
      newScale = Math.max(0.8, Math.min(newScale, 10));

      // SVG coordinates under cursor
      const svgX = ((event.clientX - rect.left) / oldScale) - this.currentTranslateX;
      const svgY = ((event.clientY - rect.top) / oldScale) - this.currentTranslateY;

      // After zoom, recalculate translation so the same SVG point stays under cursor
      this.currentTranslateX = ((event.clientX - rect.left) / newScale) - svgX;
      this.currentTranslateY = ((event.clientY - rect.top) / newScale) - svgY;
      this.currentScale = newScale;

      this.clampTranslation(rect);
      this.transform = this.updateTransform();
      return;
    }

    // Regular wheel scrolling -> pan
    const panSensitivity = 2;
    const deltaX = event.deltaX * panSensitivity;
    const deltaY = event.deltaY * panSensitivity;
    this.currentTranslateX -= deltaX / this.currentScale;
    this.currentTranslateY -= deltaY / this.currentScale;

    this.clampTranslation(rect);
    this.transform = this.updateTransform();
  }

  public onMousedown(event: MouseEvent): void {
    if (event.button !== 0) return;
    // Don't start panning if we're over any element in DESKS or ROOMS (inkscape:label)
    const target = event.target as Element;
    if (this.elementHasDesksOrRoomsLabel(target)) {
      this.isOverInteractive = true;
      return;
    }
    this.isPanning = true;
    this.startPanX = event.clientX;
    this.startPanY = event.clientY;
    (event.currentTarget as HTMLElement).classList.add('panning');
  }

  @HostListener('click', ['$event'])
  public onClick(event: MouseEvent): void {
    const target = event.target as Element;
    if (this.elementHasDesksOrRoomsLabel(target)) {
      const label = target.getAttribute && target.getAttribute('inkscape:label');
      console.log('Clicked element:', (target as Element).tagName, (target as Element).id, 'label:', label);
      // Here you can add your click handling logic
      event.stopPropagation(); // Prevent panning when clicking DESKS/ROOMS elements
    }
  }

  public onMousemove(event: MouseEvent): void {
    if (!this.isPanning) return;

    const deltaX = event.clientX - this.startPanX;
    const deltaY = event.clientY - this.startPanY;

    this.currentTranslateX += deltaX;
    this.currentTranslateY += deltaY;

    this.startPanX = event.clientX;
    this.startPanY = event.clientY;

    // APPLY CLAMPING
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.clampTranslation(rect);
    this.transform = this.updateTransform();
  }

  @HostListener('document:mouseup')
  onMouseup(): void {
    if (this.isPanning) {
      this.isPanning = false;
      document.querySelector('app-map .map-container')?.classList.remove('panning');

      // CRITICAL: Re-clamp after the drag is finished (in case movement pushed it to the edge)
      this.clampTranslation(document.querySelector('.map-container')?.getBoundingClientRect());
      this.transform = this.updateTransform();
    }
  }

  // --- 2. TOUCH PANNING/ZOOMING ---

  public onTouchStart(event: TouchEvent): void {
    event.preventDefault();

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();

    if (event.touches.length === 1) {
      // Single touch: Start Pan
      this.isPanning = true;
      this.startPanX = event.touches[0].clientX;
      this.startPanY = event.touches[0].clientY;
      (event.currentTarget as HTMLElement).classList.add('panning');
    } else if (event.touches.length === 2) {
      // Double touch: Start Pinch
      this.isPinching = true;
      this.lastTouchDistance = this.getTouchDistance(event);
      this.isPanning = false;

      // Capture the Center Point for Zoom
      const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
      const centerY = (event.touches[0].clientY + event.touches[1].clientY) / 2;

      this.centerSVG = {
        x: ((centerX - rect.left) / this.currentScale) - this.currentTranslateX,
        y: ((centerY - rect.top) / this.currentScale) - this.currentTranslateY
      };
    }
  }

  public onTouchMove(event: TouchEvent): void {
    event.preventDefault();

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();

    if (this.isPinching && event.touches.length === 2) {
      this.handlePinch(event, rect);
    } else if (this.isPanning && event.touches.length === 1) {
      this.handleTouchPan(event, rect);
    }
  }

  public onTouchEnd(): void {
    this.isPanning = false;
    this.isPinching = false;
    this.lastTouchDistance = 0;
    document.querySelector('app-map .map-container')?.classList.remove('panning');

    // CRITICAL: Re-clamp after the interaction ends
    this.clampTranslation(document.querySelector('.map-container')?.getBoundingClientRect());
    this.transform = this.updateTransform();
  }

  private handleTouchPan(event: TouchEvent, rect: DOMRect): void {
    const deltaX = event.touches[0].clientX - this.startPanX;
    const deltaY = event.touches[0].clientY - this.startPanY;

    this.currentTranslateX += deltaX;
    this.currentTranslateY += deltaY;

    this.startPanX = event.touches[0].clientX;
    this.startPanY = event.touches[0].clientY;

    // APPLY CLAMPING
    this.clampTranslation(rect);
    this.transform = this.updateTransform();
  }

  private handlePinch(event: TouchEvent, rect: DOMRect): void {
    const currentDistance = this.getTouchDistance(event);
    const distanceChange = currentDistance - this.lastTouchDistance;
    // Use exponential scaling for smooth pinch behavior
    const k = 0.004; // tuning constant
    const oldScale = this.currentScale;
    const scaleFactor = Math.exp(distanceChange * k);
    let newScale = oldScale * scaleFactor;
    newScale = Math.max(0.8, Math.min(newScale, 10));

    // Center of pinch in screen coordinates
    const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
    const centerY = (event.touches[0].clientY + event.touches[1].clientY) / 2;

    // SVG coordinates under pinch center
    const svgX = ((centerX - rect.left) / oldScale) - this.currentTranslateX;
    const svgY = ((centerY - rect.top) / oldScale) - this.currentTranslateY;

    // After zoom, recalculate translation so (svgX, svgY) stays under pinch center
    this.currentTranslateX = ((centerX - rect.left) / newScale) - svgX;
    this.currentTranslateY = ((centerY - rect.top) / newScale) - svgY;

    this.currentScale = newScale;
    this.lastTouchDistance = currentDistance;

    // APPLY CLAMPING
    this.clampTranslation(rect);

    this.transform = this.updateTransform();
  }

  private getTouchDistance(event: TouchEvent): number {
    const dx = event.touches[0].clientX - event.touches[1].clientX;
    const dy = event.touches[0].clientY - event.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Walk up the DOM from an element to see if it or any ancestor has
  // an inkscape:label equal to DESKS or ROOMS. This lets us detect
  // rects that live inside a labeled group (common when SVG is exported from Inkscape).
  private elementHasDesksOrRoomsLabel(el: Element | null): boolean {
    let current: Element | null = el;
    while (current) {
      if ((current as Element).getAttribute) {
        const label = (current as Element).getAttribute('inkscape:label');
        if (label === 'DESKS' || label === 'ROOMS') return true;
      }
      current = current.parentElement;
    }
    return false;
  }

  // --- 3. HELPER FUNCTIONS (Refactored) ---

  private getBoundaryLimits(rect: DOMRect): { minX: number, maxX: number, minY: number, maxY: number } {

    const viewportWidth = rect.width;
    const viewportHeight = rect.height;

    const scaledMapWidth = this.mapWidth * this.currentScale - viewportWidth;
    const scaledMapHeight = this.mapHeight * this.currentScale - viewportHeight;

    // minX is the maximum negative translation (panning left) allowed
    const minX = -scaledMapWidth;
    // minY is the maximum negative translation (panning up) allowed
    const minY = -scaledMapHeight;

    // maxX/maxY are the maximum positive translations (panning right/down) allowed (should be near 0)
    const maxX = 0 + this.borderMargin;
    const maxY = 0 + this.borderMargin;

    return { minX, maxX, minY, maxY };
  }

  private clampTranslation(rect: DOMRect | null | undefined): void {
    if (!rect) return;

    const limits = this.getBoundaryLimits(rect);

    // Clamp the current translation values
    if (this.mapWidth * this.currentScale > rect.width) {
      this.currentTranslateX = Math.min(Math.max(this.currentTranslateX, limits.minX), limits.maxX);
    } else {
      // If the map is smaller than the viewport, center it.
      this.currentTranslateX = limits.minX / 2;
    }

    if (this.mapHeight * this.currentScale > rect.height) {
      this.currentTranslateY = Math.min(Math.max(this.currentTranslateY, limits.minY), limits.maxY);
    } else {
      // If the map is smaller than the viewport, center it.
      this.currentTranslateY = limits.minY / 2;
    }
  }

  private updateTransform(): string {
    return `translate(${this.currentTranslateX} ${this.currentTranslateY}) scale(${this.currentScale})`;
  }
}