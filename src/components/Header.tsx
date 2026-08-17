import type { Theme } from "../types";
import { GearIcon, GoatLogo, MoonIcon, SunIcon } from "./icons";

interface HeaderProps {
  theme: Theme;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

export function Header({ theme, onToggleTheme, onOpenSettings }: HeaderProps) {
  return (
    <header className="header">
      <div className="logo">
        <GoatLogo />
        <span>
          goat<span className="accent">type</span>
        </span>
      </div>
      <div className="header-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          title={theme === "dark" ? "Light theme" : "Dark theme"}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={onOpenSettings}
          aria-label="Settings — import word lists"
          title="Settings"
        >
          <GearIcon />
        </button>
      </div>
    </header>
  );
}
