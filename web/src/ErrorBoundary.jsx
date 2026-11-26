import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Something went wrong.' };
  }

  componentDidCatch(error) {
    console.error('Moovie crashed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', background: '#111014', color: '#f4f2ec', textAlign: 'center', padding: '24px', fontFamily: 'system-ui, sans-serif' }}>
          <span style={{ fontSize: '13px', letterSpacing: '0.18em', opacity: 0.6 }}>MOOVIE WEB</span>
          <h1 style={{ fontSize: '22px', margin: 0 }}>Something went wrong.</h1>
          <p style={{ maxWidth: '420px', margin: 0, opacity: 0.7, fontSize: '14px' }}>
            The app hit an unexpected error and stopped. Reloading usually fixes it.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: '8px', padding: '11px 26px', borderRadius: '999px', border: 'none', cursor: 'pointer', background: '#f5c518', color: '#14130d', fontWeight: 700, fontSize: '14px' }}
          >
            Reload Moovie
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
