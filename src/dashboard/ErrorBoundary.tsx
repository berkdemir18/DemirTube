// DemirTube · sayfa hata sınırı
//
// Sayfalar tembel yüklenir; tek bir ekranın render hatası veya güncelleme sonrası
// düşen bir chunk isteği, sınır olmadan tüm dashboard'ı boş ekrana çeviriyordu.
// Sınır yalnızca içerik alanını kaplar: sidebar, üst çubuk ve dönem seçici ayakta
// kalır, kullanıcı başka bir ekrana geçebilir.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

type Props = {
  /** Değişince sınır kendini sıfırlar; sayfa kimliği verilir. */
  resetKey: string;
  children: ReactNode;
  onGoHome?: () => void;
};

type State = { error?: Error };

/** Güncelleme sonrası eski chunk adresleri 404 döner; mesajı ayırt edilebilir tutuyoruz. */
function isChunkLoadError(error: Error) {
  return /dynamically imported module|Loading chunk|Failed to fetch/i.test(`${error.name} ${error.message}`);
}

export class PageErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(previous: Props) {
    // Başka bir ekrana geçildiğinde hata ekranı takılı kalmamalı.
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({});
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[DemirTube] sayfa hatası", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <section className="page-error" role="alert">
        <span aria-hidden="true"><AlertTriangle size={22} /></span>
        <div>
          <strong>Bu ekran açılamadı</strong>
          <p>
            {isChunkLoadError(error)
              ? "Eklenti güncellenmiş olabilir; bu sekmeyi yenilediğinde ekran tekrar yüklenir."
              : "Diğer ekranlar çalışmaya devam ediyor. Sorun sürerse Ayarlar → Tanılama kaydını kontrol et."}
          </p>
          <code>{error.message}</code>
        </div>
        <div className="page-error-actions">
          <button className="button primary" type="button" onClick={() => this.setState({})}>Tekrar dene</button>
          <button className="button" type="button" onClick={() => location.reload()}>Sayfayı yenile</button>
          {this.props.onGoHome ? (
            <button className="button" type="button" onClick={() => { this.setState({}); this.props.onGoHome?.(); }}>
              Genel Bakış'a dön
            </button>
          ) : null}
        </div>
      </section>
    );
  }
}
