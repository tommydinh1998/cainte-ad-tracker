import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import KpiSubmit from './KpiSubmit.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, info: null }; }
  componentDidCatch(error, info) { this.setState({ error, info }); }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return React.createElement('div', { style: { padding: 40, fontFamily: 'monospace', background: '#fff', color: 'red' } },
        React.createElement('h2', null, 'App Error'),
        React.createElement('pre', null, String(this.state.error)),
        React.createElement('pre', null, this.state.error?.stack?.substring(0, 800))
      );
    }
    return this.props.children;
  }
}

// /r/<token> er indsendelseslinket: ingen adgangskode, ingen app-shell.
// Alt andet er Ops-appen.
const submitToken = (window.location.pathname.match(/^\/r\/([A-Za-z0-9_-]+)/) || [])[1]

ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(ErrorBoundary, null,
    submitToken
      ? React.createElement(KpiSubmit, { token: submitToken })
      : React.createElement(App)
  )
)
