// DemirTube · YouTube yan panelinin Shadow DOM stilleri.
// Panel host'u sayfadan tamamen izole olduğu için bu stiller dashboard'ın
// global.css katmanlarından bağımsızdır ve yalnızca video-ui paketine girer.
export const panelCss = `
  :host {
    all: initial;
    --dt-bg: #090d16;
    --dt-surface: #101a2f;
    --dt-surface-strong: #14213a;
    --dt-border: rgba(255, 255, 255, 0.08);
    --dt-text: #f2f4fa;
    --dt-muted: rgba(242, 244, 250, 0.55);
    --dt-coral: #ff5148;
    --dt-cyan: #00c9d4;
    --dt-violet: #8b5cf6;
    --dt-green: #10b981;
    --dt-amber: #f59e0b;
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
    border: 1px solid rgba(167, 139, 250, .55);
    border-radius: 9px;
    padding: 9px 12px;
    color: var(--dt-text);
    background: rgba(167, 139, 250, .16);
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
    background: rgba(167, 139, 250, .05);
  }
  .dt-format-feedback span { display: grid; gap: 2px; }
  .dt-format-feedback strong { font-size: 12px; }
  .dt-format-feedback small { color: var(--dt-muted); font-size: 10px; }
  .dt-format-feedback select {
    min-width: 0; border: 1px solid var(--dt-border); border-radius: 8px; padding: 7px 8px;
    background: var(--dt-surface); color: var(--dt-text); font-size: 11px;
  }

  .dt-expectation-card { display: grid; gap: 8px; padding: 11px; border: 1px solid var(--dt-border); border-radius: 10px; background: rgba(0,201,212,.05); }
  .dt-expectation-card > div { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .dt-expectation-card span { display: grid; gap: 2px; }
  .dt-expectation-card small { color: var(--dt-muted); font-size: 9px; text-transform: uppercase; }
  .dt-expectation-card b { font-size: 11px; }
  .dt-expectation-card p { margin: 0; color: var(--dt-muted); font-size: 11px; }
  .dt-moment-list { display: grid; gap: 6px; }
  .dt-moment-list > strong { font-size: 11px; }
  .dt-moment-list button {
    display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 7px; text-align: left;
    border: 1px solid var(--dt-border); border-radius: 8px; padding: 7px; background: var(--dt-surface); color: var(--dt-text); cursor: pointer;
  }
  .dt-moment-list button b { color: var(--dt-cyan); font-size: 10px; }
  .dt-moment-list button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
  .dt-attention-list { display:grid; gap:6px; margin-top:4px; }
  .dt-attention-list>strong { font-size:11px; }
  .dt-attention-list>div { display:grid; grid-template-columns:1fr auto; gap:8px; padding:7px 8px; border-left:3px solid #64748b; border-radius:7px; background:rgba(148,163,184,.06); }
  .dt-attention-list span,.dt-attention-list b,.dt-attention-list small { display:block; }
  .dt-attention-list span { display:flex; gap:7px; min-width:0; }
  .dt-attention-list b { color:var(--dt-cyan); font-size:9px; }
  .dt-attention-list small { overflow:hidden; color:var(--dt-text); text-overflow:ellipsis; white-space:nowrap; font-size:9px; }
  .dt-attention-list em { color:var(--dt-muted); font-size:8px; font-style:normal; white-space:nowrap; }
  .dt-attention-izlendi,.dt-attention-tekrar-izlendi { border-left-color:#4ade80!important; }
  .dt-attention-kısmen-izlendi { border-left-color:#f5b85c!important; }

  .dt-panel {
    --dt-score-color: var(--dt-cyan);
    width: 100%;
    contain: layout paint;
    overflow: hidden;
    border: 1px solid rgba(139, 92, 246, .28);
    border-radius: 16px;
    background:
      radial-gradient(circle at 100% 0, rgba(139, 92, 246, .08), transparent 34%),
      var(--dt-bg);
    box-shadow: 0 16px 38px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(0, 201, 212, .035) inset;
    color: var(--dt-text);
    font-size: 14px;
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
    background: #0c1220;
  }
  .dt-live-status { display:flex; align-items:center; gap:9px; margin:10px 14px 0; padding:9px 11px; border:1px solid rgba(148,163,184,.14); border-radius:10px; background:rgba(9,18,28,.56); }
  .dt-live-status>i { flex:0 0 auto; width:8px; height:8px; border-radius:50%; background:#94a3b8; box-shadow:0 0 0 4px rgba(148,163,184,.1); }
  .dt-live-status>span,.dt-live-status strong,.dt-live-status small { display:block; }
  .dt-live-status strong { color:#f8fafc; font-size:11px; }
  .dt-live-status small { margin-top:1px; color:#93a4b8; font-size:9px; }
  .dt-live-counting>i { background:#4ade80; box-shadow:0 0 0 4px rgba(74,222,128,.12); animation:dt-pulse 1.5s ease-in-out infinite; }
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
    font-size: 15px;
    font-family: Sora, Inter, ui-sans-serif, system-ui, sans-serif;
    letter-spacing: -0.025em;
  }

  .dt-brand-copy { display: grid; gap: 1px; min-width: 0; }
  .dt-brand-copy small { color: #7f93a9; font-size: 9px; font-weight: 750; letter-spacing: .055em; text-transform: uppercase; }

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
    box-shadow: 0 9px 22px rgba(139, 92, 246, .25);
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
    border: 1px solid rgba(148, 163, 184, .16);
    border-radius: 999px;
    background: rgba(148, 163, 184, .055);
    font-size: 10px;
    font-weight: 700;
  }

  .dt-mini-score {
    color: var(--dt-green);
    font-size: 15px;
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
    color: #090d16;
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
    color: #dce6ef;
    font-size: 13px;
  }

  .dt-mode-title-copy > small {
    color: #7f93a9;
    font-size: 9px;
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
    background: #0c1722;
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
    background: rgba(148, 163, 184, .07);
    color: #91a3b8;
  }

  .dt-mode-option-copy {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .dt-mode-option-copy strong {
    overflow: hidden;
    color: #dce6ef;
    font-size: 10px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dt-mode-option-copy small {
    color: #71859a;
    font-size: 8px;
    line-height: 1.2;
  }

  .dt-mode-options button[aria-pressed="true"] {
    border-color: rgba(139, 92, 246, .5);
    background: linear-gradient(135deg, rgba(139,92,246,.18), rgba(0,201,212,.1));
    color: var(--dt-cyan);
    box-shadow: inset 0 0 0 1px rgba(0, 201, 212, .16), 0 5px 13px rgba(0, 0, 0, .18);
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
    box-shadow: 0 0 9px rgba(0, 201, 212, .7);
  }

  .dt-mode-options button[aria-pressed="true"] .dt-mode-icon {
    background: rgba(0, 201, 212, .12);
    color: var(--dt-cyan);
  }

  .dt-mode-options button[aria-pressed="true"] .dt-mode-option-copy strong { color: #ecfbff; }
  .dt-mode-options button:hover { border-color: rgba(139, 92, 246, .34); background: rgba(139,92,246,.07); }

  .dt-summary {
    display: grid;
    grid-template-columns: 108px minmax(0, 1fr);
    gap: 14px;
    align-items: center;
    margin: 12px 14px 0;
    padding: 16px;
    border: 1px solid rgba(151,174,201,.14);
    border-radius: 14px;
    background: linear-gradient(135deg, rgba(20,35,51,.94), rgba(11,24,36,.78));
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
    font-size: 10px;
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
    border: 1px solid rgba(0, 201, 212, .28);
    border-radius: 50%;
    background: rgba(0, 201, 212, .07);
    color: var(--dt-cyan);
    cursor: pointer;
    list-style: none;
  }

  .dt-info > summary::-webkit-details-marker { display: none; }
  .dt-info > summary:hover { border-color: rgba(0, 201, 212, .55); background: rgba(0, 201, 212, .13); }

  .dt-info > div {
    position: absolute;
    top: calc(100% + 7px);
    left: 0;
    z-index: 40;
    width: min(250px, calc(100vw - 52px));
    padding: 11px 12px;
    border: 1px solid rgba(0, 201, 212, .25);
    border-radius: 10px;
    background: #132231;
    box-shadow: 0 14px 30px rgba(0,0,0,.4);
    color: #dce6ef;
    font-size: 11px;
    line-height: 1.5;
  }

  .dt-info > div strong { display: block; margin-bottom: 4px; color: #fff; font-size: 12px; }
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
    color: #d9e2ec;
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
    background: #0b1622;
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
    font-size: 9px;
    font-weight: 800;
    letter-spacing: .04em;
  }

  .dt-score-ring.dt-score-empty { background: #203044; }

  .dt-confidence {
    width: 100%;
    color: var(--dt-muted);
    font-size: 9px;
    font-weight: 700;
    line-height: 1.3;
  }

  .dt-score-retry {
    width: 100%; padding: 4px 7px; border: 1px solid rgba(0,201,212,.3); border-radius: 7px;
    background: rgba(0,201,212,.08); color: var(--dt-cyan); font: 800 9px/1.2 Inter, Roboto, sans-serif;
    cursor: pointer;
  }

  .dt-score-retry:hover { border-color: rgba(0,201,212,.55); background: rgba(0,201,212,.14); }

  .dt-summary-copy h3 {
    margin: 0 0 7px;
    color: var(--dt-green);
    font-size: 17px;
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  .dt-summary-copy > small {
    display: block;
    margin-bottom: 7px;
    color: var(--dt-muted);
    font-size: 9px;
    font-weight: 850;
    letter-spacing: .12em;
  }

  .dt-tone-mid .dt-summary-copy h3 { color: var(--dt-amber); }
  .dt-tone-low .dt-summary-copy h3 { color: #ff8a82; }

  .dt-summary-copy p {
    margin: 0;
    color: #d7e0ea;
    font-size: 12px;
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
    border-radius: 12px;
    background: var(--dt-surface);
    color: #dce6ef;
  }

  .dt-time-saving svg { color: var(--dt-cyan); }
  .dt-time-saving span { flex: 1; font-size: 12px; }

  .dt-time-saving button {
    min-height: 32px;
    padding: 0 11px;
    border: 1px solid rgba(0, 201, 212, 0.35);
    border-radius: 8px;
    background: rgba(0, 201, 212, 0.08);
    color: var(--dt-cyan);
    cursor: pointer;
    font-size: 12px;
    font-weight: 800;
  }

  .dt-prediction-outcome {
    display: grid;
    grid-template-columns: 20px minmax(0,1fr) auto;
    gap: 10px;
    align-items: center;
    margin: -4px 18px 16px;
    padding: 11px 13px;
    border: 1px solid rgba(0,201,212,.2);
    border-radius: 11px;
    background: #0d1925;
  }

  .dt-prediction-outcome > svg { color: var(--dt-cyan); }
  .dt-prediction-outcome span { display:grid; gap:3px; min-width:0; }
  .dt-prediction-outcome small { color:var(--dt-muted); font-size:8px; font-weight:850; letter-spacing:.12em; }
  .dt-prediction-outcome strong { overflow:hidden; color:#dce6ef; font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
  .dt-prediction-outcome > b { color:var(--dt-cyan); font-size:11px; }

  .dt-details {
    margin: 0 14px 14px;
    overflow: visible;
    border: 1px solid var(--dt-border);
    border-radius: 13px;
    background: #0d1824;
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
    font-size: 12px;
    font-weight: 700;
  }

  .dt-tabs button[aria-selected="true"] {
    border-bottom-color: var(--dt-cyan);
    color: var(--dt-cyan);
    background: rgba(0, 201, 212, 0.05);
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
    border-bottom: 1px solid rgba(164, 184, 207, 0.12);
  }

  .dt-signal-row:last-child { border-bottom: 0; }
  .dt-signal-row span { color: #dce6ef; }
  .dt-signal-copy { display: grid; gap: 4px; min-width: 0; }
  .dt-signal-copy > small { overflow: hidden; color: var(--dt-muted); font-size: 10px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
  .dt-signal-name { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
  .dt-signal-name .dt-info > summary { width: 18px; height: 18px; }
  .dt-signal-name .dt-info > div { left: -8px; width: min(230px, calc(100vw - 52px)); }
  .dt-signal-row strong { text-align: right; font-size: 15px; }
  .dt-signal-row i { height: 6px; overflow: hidden; border-radius: 9px; background: #243244; }
  .dt-signal-row b { display: block; height: 100%; border-radius: inherit; background: var(--dt-cyan); }

  .dt-detail-note {
    display: flex;
    gap: 9px;
    align-items: flex-start;
    margin: 12px 0 0;
    padding: 11px;
    border-radius: 10px;
    background: var(--dt-surface);
    color: #dce6ef;
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
    border-bottom:1px solid rgba(148,163,184,.12);
  }
  .dt-contribution-base { min-height:38px; color:var(--dt-muted); font-size:11px; }
  .dt-contribution-row>span { display:grid; gap:3px; min-width:0; }
  .dt-contribution-row b { color:#dce6ef; font-size:12px; }
  .dt-contribution-row small { overflow:hidden; color:var(--dt-muted); font-size:9px; text-overflow:ellipsis; white-space:nowrap; }
  .dt-contribution-row>strong { color:var(--dt-cyan); font-size:14px; }
  .dt-contribution-row>strong.negative { color:#ff8179; }
  .dt-contribution-total { border-bottom:0; color:#fff; font-size:12px; font-weight:800; }
  .dt-contribution-total strong { color:var(--dt-score-color); font-size:16px; }

  .dt-content-stack {
    display: grid;
    gap: 11px;
    color: #dce6ef;
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
    font-size: 12px;
  }

  .dt-content-metrics,
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
  .dt-personal-grid small { color: var(--dt-muted); font-size: 11px; }
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
    font-size: 12px;
    font-weight: 800;
  }

  .dt-primary-action {
    border: 1px solid transparent;
    background: linear-gradient(120deg, var(--dt-violet), var(--dt-cyan));
    color: #090d16;
    box-shadow: 0 8px 22px rgba(139, 92, 246, .22);
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
    color: #dce6ef;
    cursor: pointer;
    font-size: 11px;
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
    background: #0e1926;
    color: var(--dt-cyan);
    cursor: pointer;
    font-size: 12px;
    font-weight: 800;
  }

  .dt-primary-action:hover { filter: brightness(1.08); }
  .dt-secondary-action:hover,.dt-feedback button:hover { border-color: rgba(139,92,246,.34); background: rgba(139,92,246,.07); }

  button:focus-visible {
    outline: 2px solid var(--dt-cyan);
    outline-offset: 2px;
  }

  @media (max-width: 340px) {
    .dt-summary { grid-template-columns: 86px 1fr; gap: 10px; padding: 12px; }
    .dt-score { font-size: 52px; }
    .dt-summary-copy h3 { font-size: 16px; }
    .dt-actions { grid-template-columns: 1fr; }
    .dt-tabs button { font-size: 0; }
    .dt-tabs button svg { width: 18px; height: 18px; }
    .dt-mode-options button { grid-template-columns: 27px minmax(0, 1fr); gap: 6px; padding-left: 6px; }
    .dt-mode-icon { width: 27px; height: 27px; }
    .dt-mode-option-copy strong { font-size: 9px; }
  }

  @media (prefers-reduced-motion: reduce) {
    * { scroll-behavior: auto !important; transition-duration: 0.01ms !important; }
  }
`;
