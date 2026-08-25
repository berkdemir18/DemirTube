// DemirTube · YouTube yan panelinin Shadow DOM stilleri.
// Panel host'u sayfadan tamamen izole olduğu için bu stiller dashboard'ın
// global.css katmanlarından bağımsızdır ve yalnızca video-ui paketine girer.
export const panelCss = `
  :host {
    all: initial;
    /* Oksit paleti: dashboard'la aynı dil. Grafit zemin, mineral turuncu vurgu. */
    --dt-bg: #0B0C0D;
    --dt-surface: #141617;
    --dt-surface-strong: #1A1D1F;
    --dt-border: rgba(231, 230, 227, 0.14);
    --dt-text: #E7E6E3;
    --dt-muted: rgba(231, 230, 227, 0.58);
    /* Anlam renkleri panelde pastel kalıyordu; iyi/uyarı/risk artık net okunuyor. */
    --dt-coral: #FF5233;
    --dt-cyan: #FFB02E;
    --dt-violet: #D9542B;
    --dt-green: #5FD35A;
    --dt-amber: #FFB02E;
    --dt-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace;
    color-scheme: dark;
  }

  * {
    box-sizing: border-box;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  button {
    font: inherit;
  }

  .dt-groq-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    width: 100%;
    border: 1px solid rgba(217,84,43, .55);
    border-radius: 9px;
    padding: 9px 12px;
    color: var(--dt-text);
    background: rgba(217,84,43, .16);
    cursor: pointer;
    font-weight: 700;
  }

  .dt-groq-action:disabled { opacity: .65; cursor: wait; }
  .dt-ai-message { color: var(--dt-green); }

  .dt-format-feedback {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(145px, .9fr);
    gap: 10px;
    align-items: center;
    padding: 11px 14px;
    border-top: 1px solid var(--dt-border);
    background: rgba(217,84,43, .05);
  }
  .dt-format-feedback span { display: grid; gap: 2px; }
  .dt-format-feedback strong { font-size: 13px; }
  .dt-format-feedback small { color: var(--dt-muted); font-size: 11px; }
  .dt-format-feedback select {
    min-width: 0; border: 1px solid var(--dt-border); border-radius: 8px; padding: 7px 8px;
    background: var(--dt-surface); color: var(--dt-text); font-size: 12px;
  }

  .dt-expectation-card { display: grid; gap: 8px; padding: 11px; border: 1px solid var(--dt-border); border-radius: 10px; background: rgba(255,176,46, .05); }
  .dt-expectation-card > div { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .dt-expectation-card span { display: grid; gap: 2px; }
  .dt-expectation-card small { color: var(--dt-muted); font-size: 10px; text-transform: uppercase; }
  .dt-expectation-card b { font-size: 12px; }
  .dt-expectation-card p { margin: 0; color: var(--dt-muted); font-size: 12px; }
  .dt-moment-list { display: grid; gap: 6px; }
  .dt-moment-list > strong { font-size: 12px; }
  .dt-moment-list button {
    display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 7px; text-align: left;
    border: 1px solid var(--dt-border); border-radius: 8px; padding: 7px; background: var(--dt-surface); color: var(--dt-text); cursor: pointer;
  }
  .dt-moment-list button b { color: var(--dt-cyan); font-size: 11px; }
  .dt-moment-list button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
  .dt-attention-list { display:grid; gap:6px; margin-top:4px; }
  .dt-attention-list>strong { font-size: 12px; }
  .dt-attention-list>div { display:grid; grid-template-columns:1fr auto; gap:8px; padding:7px 8px; border-left:3px solid #8B8783; border-radius:7px; background:rgba(169,166,163,.06); }
  .dt-attention-list span,.dt-attention-list b,.dt-attention-list small { display:block; }
  .dt-attention-list span { display:flex; gap:7px; min-width:0; }
  .dt-attention-list b { color:var(--dt-cyan); font-size: 10px; }
  .dt-attention-list small { overflow:hidden; color:var(--dt-text); text-overflow:ellipsis; white-space:nowrap; font-size: 10px; }
  .dt-attention-list em { color:var(--dt-muted); font-size: 8px; font-style:normal; white-space:nowrap; }
  .dt-attention-izlendi,.dt-attention-tekrar-izlendi { border-left-color:#7FE07A!important; }
  .dt-attention-kısmen-izlendi { border-left-color:#f5b85c!important; }

  .dt-panel {
    --dt-score-color: var(--dt-cyan);
    width: 100%;
    contain: layout paint;
    overflow: hidden;
    border: 1px solid rgba(217,84,43, .28);
    border-radius: 6px;
    background:
      radial-gradient(circle at 100% 0, rgba(217,84,43, .08), transparent 34%),
      var(--dt-bg);
    box-shadow: 0 16px 38px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(255,176,46, .035) inset;
    color: var(--dt-text);
    font-size: 15px;
  }

  .dt-panel.dt-tone-high { --dt-score-color: var(--dt-green); }
  .dt-panel.dt-tone-mid { --dt-score-color: var(--dt-amber); }
  .dt-panel.dt-tone-low { --dt-score-color: var(--dt-coral); }

  .dt-header {
    min-height: 64px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 14px;
    border-bottom: 1px solid var(--dt-border);
    background: #171615;
  }
  .dt-live-status { display:flex; align-items:center; gap:9px; margin:10px 14px 0; padding:9px 11px; border:1px solid rgba(169,166,163,.14); border-radius:10px; background:rgba(19,19,18,.56); }
  .dt-live-status>i { flex:0 0 auto; width:8px; height:8px; border-radius:50%; background:#a9a6a3; box-shadow:0 0 0 4px rgba(169,166,163,.1); }
  .dt-live-status>span,.dt-live-status strong,.dt-live-status small { display:block; }
  .dt-live-status strong { color:#fafafa; font-size: 12px; }
  .dt-live-status small { margin-top:1px; color:#a8a6a3; font-size: 10px; }
  .dt-live-counting>i { background:#7FE07A; box-shadow:0 0 0 4px rgba(74,222,128,.12); animation:dt-pulse 1.5s ease-in-out infinite; }
  .dt-live-buffering>i,.dt-live-seeking>i { background:#f5b85c; }
  @keyframes dt-pulse { 50% { transform:scale(.72); opacity:.65; } }

  .dt-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .dt-brand strong {
    display: block;
    color: var(--dt-text);
    font-size: 16px;
    font-family: Sora, Inter, ui-sans-serif, system-ui, sans-serif;
    letter-spacing: -0.025em;
  }

  .dt-brand-copy { display: grid; gap: 1px; min-width: 0; }
  .dt-brand-copy small { color: #979491; font-size: 10px; font-weight: 750; letter-spacing: .055em; text-transform: uppercase; }

  .dt-brand .brand-name > span {
    background: linear-gradient(120deg, var(--dt-violet), var(--dt-cyan));
    background-clip: text;
    color: transparent;
    -webkit-background-clip: text;
  }

  .dt-logo {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 11px;
    overflow: hidden;
    background: none;
    box-shadow: 0 9px 22px rgba(217,84,43, .25);
  }

  .dt-logo svg { width: 100%; height: 100%; }

  .dt-engine,
  .dt-mini-score {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-left: auto;
    color: var(--dt-muted);
    padding: 5px 8px;
    border: 1px solid rgba(169,166,163, .16);
    border-radius: 999px;
    background: rgba(169,166,163, .055);
    font-size: 11px;
    font-weight: 700;
  }

  .dt-mini-score {
    color: var(--dt-green);
    font-size: 16px;
  }

  .dt-icon-button,
  .dt-mini-watch {
    min-width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid transparent;
    border-radius: 9px;
    background: transparent;
    color: var(--dt-muted);
    cursor: pointer;
  }

  .dt-icon-button:hover {
    border-color: var(--dt-border);
    background: var(--dt-surface);
    color: var(--dt-text);
  }

  .dt-mini-watch {
    width: auto;
    padding: 0 14px;
    border-color: transparent;
    background: linear-gradient(120deg, var(--dt-violet), var(--dt-cyan));
    color: #10100f;
    font-weight: 800;
  }

  .dt-mini .dt-header {
    border-bottom: 0;
  }

  .dt-mode-picker {
    padding: 13px 14px 0;
  }

  .dt-mode-title {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 9px;
  }

  .dt-mode-title-copy { display: grid; gap: 2px; }

  .dt-mode-title-copy > strong {
    color: #e7e6e4;
    font-size: 14px;
  }

  .dt-mode-title-copy > small {
    color: #979491;
    font-size: 10px;
    line-height: 1.35;
  }

  .dt-mode-title > .dt-info > div {
    right: 0;
    left: auto;
  }

  .dt-mode-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .dt-mode-options button {
    position: relative;
    min-width: 0;
    min-height: 54px;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    padding: 7px 22px 7px 8px;
    border: 1px solid var(--dt-border);
    border-radius: 11px;
    background: #181716;
    color: var(--dt-muted);
    cursor: pointer;
    text-align: left;
  }

  .dt-mode-icon {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: rgba(169,166,163, .07);
    color: #a8a5a1;
  }

  .dt-mode-option-copy {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .dt-mode-option-copy strong {
    overflow: hidden;
    color: #e7e6e4;
    font-size: 11px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dt-mode-option-copy small {
    color: #898682;
    font-size: 8px;
    line-height: 1.2;
  }

  .dt-mode-options button[aria-pressed="true"] {
    border-color: rgba(217,84,43, .5);
    background: linear-gradient(135deg, rgba(217,84,43, .18), rgba(255,176,46, .1));
    color: var(--dt-cyan);
    box-shadow: inset 0 0 0 1px rgba(255,176,46, .16), 0 5px 13px rgba(0, 0, 0, .18);
  }

  .dt-mode-options button[aria-pressed="true"]::after {
    content: "";
    position: absolute;
    top: 8px;
    right: 8px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--dt-cyan);
    box-shadow: 0 0 9px rgba(255,176,46, .7);
  }

  .dt-mode-options button[aria-pressed="true"] .dt-mode-icon {
    background: rgba(255,176,46, .12);
    color: var(--dt-cyan);
  }

  .dt-mode-options button[aria-pressed="true"] .dt-mode-option-copy strong { color: #f6f6f5; }
  .dt-mode-options button:hover { border-color: rgba(217,84,43, .34); background: rgba(217,84,43, .07); }

  .dt-summary {
    display: grid;
    grid-template-columns: 108px minmax(0, 1fr);
    gap: 14px;
    align-items: center;
    margin: 12px 14px 0;
    padding: 16px;
    border: 1px solid rgba(180,176,172,.14);
    border-radius: 6px;
    background: linear-gradient(135deg, rgba(37,36,34,.94), rgba(25,24,22,.78));
  }

  .dt-score-column {
    display: grid;
    align-content: center;
    min-width: 0;
  }

  .dt-score-label {
    display: flex;
    align-items: center;
    gap: 5px;
    width: max-content;
    max-width: 100%;
    color: var(--dt-muted);
  }

  .dt-score-label > small {
    color: var(--dt-muted);
    font-size: 11px;
  }

  .dt-info {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
  }

  .dt-info > summary {
    width: 21px;
    height: 21px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255,176,46, .28);
    border-radius: 50%;
    background: rgba(255,176,46, .07);
    color: var(--dt-cyan);
    cursor: pointer;
    list-style: none;
  }

  .dt-info > summary::-webkit-details-marker { display: none; }
  .dt-info > summary:hover { border-color: rgba(255,176,46, .55); background: rgba(255,176,46, .13); }

  .dt-info > div {
    position: absolute;
    top: calc(100% + 7px);
    left: 0;
    z-index: 40;
    width: min(250px, calc(100vw - 52px));
    padding: 11px 12px;
    border: 1px solid rgba(255,176,46, .25);
    border-radius: 10px;
    background: #242220;
    box-shadow: 0 14px 30px rgba(0,0,0,.4);
    color: #e7e6e4;
    font-size: 12px;
    line-height: 1.5;
  }

  .dt-info > div strong { display: block; margin-bottom: 4px; color: #fff; font-size: 13px; }
  .dt-info > div p { margin: 0; }

  .dt-score {
    display: flex;
    align-items: baseline;
    gap: 7px;
    margin: 6px 0 5px;
    color: var(--dt-green);
    font-size: clamp(54px, 16vw, 76px);
    line-height: 0.95;
    letter-spacing: -0.07em;
    font-variant-numeric: tabular-nums;
  }

  .dt-score > small {
    color: #e4e3e1;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: -.02em;
  }

  .dt-score.dt-score-empty {
    color: var(--dt-muted);
    font-size: 22px;
    letter-spacing: -0.025em;
    line-height: 1.15;
  }

  .dt-tone-mid .dt-score { color: var(--dt-amber); }
  .dt-tone-low .dt-score { color: var(--dt-coral); }

  .dt-score-ring {
    width: 76px;
    height: 76px;
    display: grid;
    place-items: center;
    margin: 6px 0;
    border-radius: 50%;
    position: relative;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.07);
  }

  .dt-score-ring::before {
    content: "";
    position: absolute;
    inset: 7px;
    border-radius: inherit;
    background: #181715;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.06);
  }

  .dt-score-ring > span {
    position: relative;
    z-index: 1;
    display: grid;
    place-items: center;
  }

  .dt-score-ring strong {
    color: var(--dt-text);
    font-size: 28px;
    line-height: 1;
    letter-spacing: -.055em;
    font-variant-numeric: tabular-nums;
  }

  .dt-score-ring small {
    margin-top: 3px;
    color: var(--dt-muted);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .04em;
  }

  .dt-score-ring.dt-score-empty { background: #35322f; }

  .dt-confidence {
    width: 100%;
    color: var(--dt-muted);
    font-size: 10px;
    font-weight: 700;
    line-height: 1.3;
  }

  .dt-score-retry {
    width: 100%; padding: 4px 7px; border: 1px solid rgba(255,176,46, .3); border-radius: 7px;
    background: rgba(255,176,46, .08); color: var(--dt-cyan); font: 800 9px/1.2 Inter, Roboto, sans-serif;
    cursor: pointer;
  }

  .dt-score-retry:hover { border-color: rgba(255,176,46, .55); background: rgba(255,176,46, .14); }

  .dt-summary-copy h3 {
    margin: 0 0 7px;
    color: var(--dt-green);
    font-size: 18px;
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  .dt-summary-copy > small {
    display: block;
    margin-bottom: 7px;
    color: var(--dt-muted);
    font-size: 10px;
    font-weight: 850;
    letter-spacing: .12em;
  }

  .dt-tone-mid .dt-summary-copy h3 { color: var(--dt-amber); }
  .dt-tone-low .dt-summary-copy h3 { color: #ff8a82; }

  .dt-summary-copy p {
    margin: 0;
    color: #e2e1df;
    font-size: 13px;
    line-height: 1.48;
  }

  .dt-time-saving {
    min-height: 46px;
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 10px 14px 14px;
    padding: 9px 12px;
    border: 1px solid var(--dt-border);
    border-radius: 6px;
    background: var(--dt-surface);
    color: #e7e6e4;
  }

  .dt-time-saving svg { color: var(--dt-cyan); }
  .dt-time-saving span { flex: 1; font-size: 13px; }

  .dt-time-saving button {
    min-height: 32px;
    padding: 0 11px;
    border: 1px solid rgba(255,176,46, 0.35);
    border-radius: 8px;
    background: rgba(255,176,46, 0.08);
    color: var(--dt-cyan);
    cursor: pointer;
    font-size: 13px;
    font-weight: 800;
  }

    display: grid;
    grid-template-columns: 20px minmax(0,1fr) auto;
    gap: 10px;
    align-items: center;
    margin: -4px 18px 16px;
    padding: 11px 13px;
    border: 1px solid rgba(255,176,46, .2);
    border-radius: 11px;
    background: #1a1918;
  }


  .dt-details {
    margin: 0 14px 14px;
    overflow: visible;
    border: 1px solid var(--dt-border);
    border-radius: 6px;
    background: #1a1917;
  }

  .dt-tabs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border-bottom: 1px solid var(--dt-border);
  }

  .dt-tabs button {
    min-width: 0;
    min-height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--dt-muted);
    cursor: pointer;
    font-size: 13px;
    font-weight: 700;
  }

  .dt-tabs button[aria-selected="true"] {
    border-bottom-color: var(--dt-cyan);
    color: var(--dt-cyan);
    background: rgba(255,176,46, 0.05);
  }

  .dt-detail-content {
    min-height: 190px;
    padding: 14px;
  }

  .dt-signal-list {
    display: grid;
  }

  .dt-signal-row {
    min-height: 62px;
    display: grid;
    grid-template-columns: minmax(0,1fr) 32px minmax(90px,.85fr);
    gap: 11px;
    align-items: center;
    border-bottom: 1px solid rgba(189,186,182, 0.12);
  }

  .dt-signal-row:last-child { border-bottom: 0; }
  .dt-signal-row span { color: #e7e6e4; }
  .dt-signal-copy { display: grid; gap: 4px; min-width: 0; }
  .dt-signal-copy > small { overflow: hidden; color: var(--dt-muted); font-size: 11px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
  .dt-signal-name { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
  .dt-signal-name .dt-info > summary { width: 18px; height: 18px; }
  .dt-signal-name .dt-info > div { left: -8px; width: min(230px, calc(100vw - 52px)); }
  .dt-signal-row strong { text-align: right; font-size: 16px; }
  .dt-signal-row i { height: 6px; overflow: hidden; border-radius: 9px; background: #373431; }
  .dt-signal-row b { display: block; height: 100%; border-radius: inherit; background: var(--dt-cyan); }

  .dt-detail-note {
    display: flex;
    gap: 9px;
    align-items: flex-start;
    margin: 12px 0 0;
    padding: 11px;
    border-radius: 10px;
    background: var(--dt-surface);
    color: #e7e6e4;
    line-height: 1.45;
  }

  .dt-detail-note svg { flex: 0 0 auto; color: var(--dt-cyan); margin-top: 2px; }

  .dt-contribution-list { display:grid; }
  .dt-contribution-base,
  .dt-contribution-row,
  .dt-contribution-total {
    min-height: 51px;
    display:grid;
    grid-template-columns:minmax(0,1fr) auto;
    gap:12px;
    align-items:center;
    border-bottom:1px solid rgba(169,166,163,.12);
  }
  .dt-contribution-base { min-height:38px; color:var(--dt-muted); font-size: 12px; }
  .dt-contribution-row>span { display:grid; gap:3px; min-width:0; }
  .dt-contribution-row b { color:#e7e6e4; font-size: 13px; }
  .dt-contribution-row small { overflow:hidden; color:var(--dt-muted); font-size: 10px; text-overflow:ellipsis; white-space:nowrap; }
  .dt-contribution-row>strong { color:var(--dt-cyan); font-size: 15px; }
  .dt-contribution-row>strong.negative { color:#ff8179; }
  .dt-contribution-total { border-bottom:0; color:#fff; font-size: 13px; font-weight:800; }
  .dt-contribution-total strong { color:var(--dt-score-color); font-size: 17px; }

  .dt-content-stack {
    display: grid;
    gap: 11px;
    color: #e7e6e4;
  }

  .dt-content-stack p { margin: 0; line-height: 1.55; }
  .dt-content-stack small { color: var(--dt-muted); line-height: 1.45; }

  .dt-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .dt-chip-row span {
    padding: 6px 9px;
    border: 1px solid var(--dt-border);
    border-radius: 8px;
    background: var(--dt-surface);
    color: var(--dt-muted);
    font-size: 13px;
  }

  .dt-content-metrics,
  /* Karar kartının altındaki tahmin/gerçek ikilisi. */
  .dt-summary-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 11px; }
  .dt-summary-stats span { display: grid; gap: 3px; padding: 8px 10px; border: 1px solid var(--dt-border); border-radius: 6px; background: rgba(231,230,227,.04); }
  .dt-summary-stats small { color: var(--dt-muted); font: 500 10px/1.3 var(--dt-mono); letter-spacing: .08em; text-transform: uppercase; }
  .dt-summary-stats b { color: var(--dt-text); font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }

  .dt-personal-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 9px;
  }

  .dt-content-metrics > div,
  .dt-personal-grid > div {
    min-height: 70px;
    display: grid;
    align-content: center;
    gap: 5px;
    padding: 11px;
    border: 1px solid var(--dt-border);
    border-radius: 10px;
    background: var(--dt-surface);
  }

  .dt-content-metrics small,
  .dt-personal-grid small { color: var(--dt-muted); font-size: 12px; }
  .dt-content-metrics strong,
  .dt-personal-grid strong { font-size: 18px; }

  .dt-ai-heading {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--dt-violet);
  }

  .dt-actions {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
    gap: 8px;
    padding: 0 14px 9px;
  }

  .dt-primary-action,
  .dt-secondary-action {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    border-radius: 11px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 800;
  }

  .dt-primary-action {
    border: 1px solid transparent;
    background: linear-gradient(120deg, var(--dt-violet), var(--dt-cyan));
    color: #10100f;
    box-shadow: 0 8px 22px rgba(217,84,43, .22);
  }

  .dt-secondary-action {
    border: 1px solid var(--dt-border);
    background: transparent;
    color: var(--dt-text);
  }

  .dt-secondary-action.saved {
    border-color: rgba(16, 185, 129, 0.35);
    color: var(--dt-green);
  }

  .dt-feedback {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 0 14px 12px;
  }

  .dt-feedback button {
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid var(--dt-border);
    border-radius: 10px;
    background: var(--dt-surface);
    color: #e7e6e4;
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
  }

  .dt-feedback button.selected.positive {
    border-color: rgba(16, 185, 129, 0.44);
    color: var(--dt-green);
    background: rgba(16, 185, 129, 0.08);
  }

  .dt-feedback button.selected.negative {
    border-color: rgba(255, 81, 72, 0.44);
    color: #ff8a82;
    background: rgba(255, 81, 72, 0.08);
  }

  .dt-details-toggle {
    width: 100%;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 14px;
    border: 0;
    border-top: 1px solid var(--dt-border);
    background: #1b1a19;
    color: var(--dt-cyan);
    cursor: pointer;
    font-size: 13px;
    font-weight: 800;
  }

  .dt-primary-action:hover { filter: brightness(1.08); }
  .dt-secondary-action:hover,.dt-feedback button:hover { border-color: rgba(217,84,43, .34); background: rgba(217,84,43, .07); }

  button:focus-visible {
    outline: 2px solid var(--dt-cyan);
    outline-offset: 2px;
  }

  @media (max-width: 340px) {
    .dt-summary { grid-template-columns: 86px 1fr; gap: 10px; padding: 12px; }
    .dt-score { font-size: 52px; }
    .dt-summary-copy h3 { font-size: 17px; }
    .dt-actions { grid-template-columns: 1fr; }
    .dt-tabs button { font-size: 0; }
    .dt-tabs button svg { width: 18px; height: 18px; }
    .dt-mode-options button { grid-template-columns: 27px minmax(0, 1fr); gap: 6px; padding-left: 6px; }
    .dt-mode-icon { width: 27px; height: 27px; }
    .dt-mode-option-copy strong { font-size: 10px; }
  }

  @media (prefers-reduced-motion: reduce) {
    * { scroll-behavior: auto !important; transition-duration: 0.01ms !important; }
  }
`;
