import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Density = "comfortable" | "dense";

interface DensityContextValue {
  density: Density;
  setDensity: (d: Density) => void;
  toggle: () => void;
}

const DensityContext = createContext<DensityContextValue | null>(null);

export function DensityProvider({ children }: { children: React.ReactNode }) {
  const [density, setDensityState] = useState<Density>("comfortable");

  useEffect(() => {
    const stored = localStorage.getItem("density") as Density | null;
    if (stored) {
      setDensityState(stored);
      applyDensity(stored);
    }
  }, []);

  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    localStorage.setItem("density", d);
    applyDensity(d);
  }, []);

  const toggle = useCallback(() => {
    setDensity(density === "comfortable" ? "dense" : "comfortable");
  }, [density, setDensity]);

  return (
    <DensityContext.Provider value={{ density, setDensity, toggle }}>
      {children}
    </DensityContext.Provider>
  );
}

export function useDensity() {
  const ctx = useContext(DensityContext);
  if (!ctx) throw new Error("useDensity must be used within DensityProvider");
  return ctx;
}

function applyDensity(density: Density) {
  document.documentElement.setAttribute("data-density", density);
}
