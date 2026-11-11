import { LogoMark } from './logo';

/**
 * Custom title bar, visible only when the installed desktop app runs in
 * Window Controls Overlay mode (see globals.css). The whole bar is draggable;
 * the OS draws minimise / maximise / close on the right.
 */
export function TitleBar() {
  return (
    <div className="wco-titlebar select-none items-center gap-2 border-b border-border/60 bg-background/95 px-3 backdrop-blur" aria-hidden>
      <LogoMark className="h-4 w-4" />
      <span className="text-xs font-semibold tracking-tight text-foreground/80">ExpenseFlow</span>
    </div>
  );
}
