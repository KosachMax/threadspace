import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useLanguage } from "./i18n";
import { Icon } from "./icons";
import "./compact-sheet.css";

/** Host-shimmed dialog shares focus, scroll lock and dismissal with BB's drawer. */
export function CompactSheet({ open, onOpenChange, title, theme, className, children, onCloseAutoFocus }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  theme: "light" | "dark";
  className?: string;
  children: ReactNode;
  onCloseAutoFocus?(event: Event): void;
}) {
  const language = useLanguage(), closeButton = useRef<HTMLButtonElement>(null);
  const [viewport, setViewport] = useState({ height: 0, bottom: 0 });
  useEffect(() => {
    if (!open) return;
    const visual = window.visualViewport;
    const update = () => setViewport({ height: visual?.height ?? window.innerHeight, bottom: visual ? Math.max(0, window.innerHeight - visual.height - visual.offsetTop) : 0 });
    update();
    visual?.addEventListener("resize", update);
    visual?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => { visual?.removeEventListener("resize", update); visual?.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [open]);
  const style = { "--ns-sheet-available-height": viewport.height ? `${viewport.height}px` : "100dvh", "--ns-sheet-bottom": `${viewport.bottom}px` } as CSSProperties;
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    {open && <Dialog.Portal>
      <Dialog.Overlay className="ns-sheet-overlay"/>
      <Dialog.Content className={["ns-compact-sheet ns-surface", className].filter(Boolean).join(" ")} data-theme={theme} lang={language} style={style} aria-describedby={undefined}
        onCloseAutoFocus={onCloseAutoFocus} onOpenAutoFocus={event => { event.preventDefault(); closeButton.current?.focus({ preventScroll: true }); }}>
        <div className="ns-sheet-header"><Dialog.Title>{title}</Dialog.Title><Dialog.Close ref={closeButton} className="ns-sheet-close" aria-label={language === "ru" ? "Закрыть" : "Close"}><Icon name="close"/></Dialog.Close></div>
        <div className="ns-sheet-body">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>}
  </Dialog.Root>;
}
