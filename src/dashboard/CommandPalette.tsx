// DemirTube · komut paleti (Ctrl/Cmd+K)
//
// Sayfa, dönem, hızlı işlem ve izleme geçmişindeki videolar tek arama kutusundan
// açılır. Sıralama mantığı command-search.ts içindedir; burada yalnızca klavye
// gezinmesi ve erişilebilir işaretleme var.
import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Hash, LayoutGrid, Play, Tv, Wrench } from "lucide-react";
import type { VideoRecord } from "../shared/types";
import { buildCommands, searchCommands, type Command } from "./command-search";

const kindIcon = {
  page: LayoutGrid,
  channel: Tv,
  topic: Hash,
  period: Clock3,
  action: Wrench,
  video: Play,
} as const;

const kindLabel: Record<Command["kind"], string> = {
  page: "Sayfa",
  channel: "Kanal",
  topic: "Konu",
  period: "Dönem",
  action: "İşlem",
  video: "Video",
};

export function CommandPalette({
  videos, onClose, onRun,
}: {
  videos: VideoRecord[];
  onClose: () => void;
  onRun: (command: Command) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo(() => buildCommands(videos), [videos]);
  const results = useMemo(() => searchCommands(commands, query), [commands, query]);

  // Sorgu değişince seçim listenin başına döner; aksi halde eski indeks boşa düşer.
  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, results]);

  const run = (command?: Command) => {
    if (!command) return;
    onRun(command);
    onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => (index + 1) % Math.max(1, results.length)); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => (index - 1 + results.length) % Math.max(1, results.length)); return; }
    if (event.key === "Enter") { event.preventDefault(); run(results[active]); }
  };

  return (
    <div className="palette-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Komut paleti">
        <input
          className="palette-input"
          autoFocus
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
          aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
          placeholder="Sayfa, kanal, konu, dönem, işlem veya video ara…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />

        <div className="palette-results" id="palette-results" role="listbox" ref={listRef}>
          {results.length ? results.map((command, index) => {
            const Icon = kindIcon[command.kind];
            return (
              <button
                key={command.id}
                id={`palette-${command.id}`}
                type="button"
                role="option"
                aria-selected={index === active}
                className={index === active ? "active" : ""}
                onMouseMove={() => setActive(index)}
                onClick={() => run(command)}
              >
                <Icon size={15} aria-hidden="true" />
                <span className="palette-label">{command.label}</span>
                <small>{command.hint || kindLabel[command.kind]}</small>
              </button>
            );
          }) : (
            <p className="palette-empty">Eşleşen komut yok.</p>
          )}
        </div>

        <footer className="palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> gez</span>
          <span><kbd>Enter</kbd> aç</span>
          <span><kbd>Esc</kbd> kapat</span>
        </footer>
      </div>
    </div>
  );
}
