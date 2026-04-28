'use client';

import { createContext, useContext, useId, useMemo, useState, type ReactNode } from 'react';

interface TabsContextValue {
  activeValue: string;
  setActiveValue: (value: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tabs components must be used inside <Tabs>.');
  }
  return context;
}

export function Tabs({
  defaultValue,
  children,
}: {
  defaultValue: string;
  children: ReactNode;
}): JSX.Element {
  const [activeValue, setActiveValue] = useState(defaultValue);
  const baseId = useId();
  const value = useMemo(() => ({ activeValue, setActiveValue, baseId }), [activeValue, baseId]);

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function TabsList({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div role="tablist" aria-orientation="horizontal" className="border-border flex gap-5 border-b">
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}): JSX.Element {
  const { activeValue, setActiveValue, baseId } = useTabsContext();
  const selected = activeValue === value;

  return (
    <button
      id={`${baseId}-tab-${value}`}
      role="tab"
      type="button"
      aria-selected={selected}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      onClick={() => setActiveValue(value)}
      className={`-mb-px border-b-2 px-1 pb-3 text-sm font-medium transition ${
        selected ? 'border-accent text-text' : 'text-text-muted hover:text-text border-transparent'
      }`}
    >
      {children}
    </button>
  );
}

export function TabsPanel({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}): JSX.Element | null {
  const { activeValue, baseId } = useTabsContext();
  if (activeValue !== value) return null;

  return (
    <div
      id={`${baseId}-panel-${value}`}
      role="tabpanel"
      aria-labelledby={`${baseId}-tab-${value}`}
      className="pt-6"
    >
      {children}
    </div>
  );
}
