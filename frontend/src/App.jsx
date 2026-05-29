import { NavLink, Route, Routes } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { createLog, deleteLog, fetchAggregate, fetchLog, fetchLogs, updateLog } from './api';

const emptyForm = {
  timestamp: new Date().toISOString().slice(0, 16),
  message: '',
  severity: 'info',
  source: '',
};

function toApiTimestamp(value) {
  return new Date(value).toISOString();
}

function Layout({ children }) {
  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Simple, human, useful</p>
          <h1>Logs Dashboard</h1>
        </div>
        <nav className="nav-tabs">
          <NavLink to="/" end>
            Logs
          </NavLink>
          <NavLink to="/new">New log</NavLink>
          <NavLink to="/dashboard">Dashboard</NavLink>
        </nav>
      </header>
      {children}
    </div>
  );
}

function Filters({ filters, setFilters, sources }) {
  return (
    <section className="card filters-grid">
      <input
        placeholder="Search message or source"
        value={filters.search}
        onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value, page: 1 }))}
      />
      <select
        value={filters.severity}
        onChange={(event) => setFilters((current) => ({ ...current, severity: event.target.value, page: 1 }))}
      >
        <option value="">All severities</option>
        <option value="debug">Debug</option>
        <option value="info">Info</option>
        <option value="warning">Warning</option>
        <option value="error">Error</option>
      </select>
      <select
        value={filters.source}
        onChange={(event) => setFilters((current) => ({ ...current, source: event.target.value, page: 1 }))}
      >
        <option value="">All sources</option>
        {sources.map((source) => (
          <option key={source} value={source}>
            {source}
          </option>
        ))}
      </select>
      <select
        value={filters.sort_by}
        onChange={(event) => setFilters((current) => ({ ...current, sort_by: event.target.value }))}
      >
        <option value="timestamp">Sort by time</option>
        <option value="severity">Sort by severity</option>
        <option value="source">Sort by source</option>
      </select>
      <select
        value={filters.sort_order}
        onChange={(event) => setFilters((current) => ({ ...current, sort_order: event.target.value }))}
      >
        <option value="desc">Newest first</option>
        <option value="asc">Oldest first</option>
      </select>
      <input
        type="date"
        value={filters.start_date}
        onChange={(event) => setFilters((current) => ({ ...current, start_date: event.target.value, page: 1 }))}
      />
      <input
        type="date"
        value={filters.end_date}
        onChange={(event) => setFilters((current) => ({ ...current, end_date: event.target.value, page: 1 }))}
      />
    </section>
  );
}

function LogsPage() {
  const [filters, setFilters] = useState({
    page: 1,
    page_size: 6,
    search: '',
    severity: '',
    source: '',
    sort_by: 'timestamp',
    sort_order: 'desc',
    start_date: '',
    end_date: '',
  });
  const [data, setData] = useState({ items: [], total: 0, page: 1, page_size: 6 });
  const [sources, setSources] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetchLogs(filters), fetchAggregate(filters)])
      .then(([logs, aggregate]) => {
        setData(logs);
        setSources(Object.keys(aggregate.by_source));
        setError('');
      })
      .catch((requestError) => setError(requestError.message));
  }, [filters]);

  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));

  return (
    <Layout>
      <Filters filters={filters} setFilters={setFilters} sources={sources} />
      {error ? <p className="status error">{error}</p> : null}
      <section className="card">
        <div className="section-header">
          <h2>All logs</h2>
          <span>{data.total} entries</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Severity</th>
                <th>Source</th>
                <th>Message</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.timestamp).toLocaleString()}</td>
                  <td>
                    <span className={`pill ${item.severity}`}>{item.severity}</span>
                  </td>
                  <td>{item.source}</td>
                  <td>{item.message}</td>
                  <td>
                    <NavLink className="text-link" to={`/logs/${item.id}`}>
                      Open
                    </NavLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <button disabled={filters.page === 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>
            Previous
          </button>
          <span>
            Page {filters.page} of {totalPages}
          </span>
          <button
            disabled={filters.page >= totalPages}
            onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
          >
            Next
          </button>
        </div>
      </section>
    </Layout>
  );
}

function LogForm({ value, onChange, onSubmit, submitLabel }) {
  return (
    <form className="card form-grid" onSubmit={onSubmit}>
      <label>
        Timestamp
        <input
          type="datetime-local"
          value={value.timestamp}
          onChange={(event) => onChange({ ...value, timestamp: event.target.value })}
          required
        />
      </label>
      <label>
        Severity
        <select value={value.severity} onChange={(event) => onChange({ ...value, severity: event.target.value })}>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
        </select>
      </label>
      <label>
        Source
        <input value={value.source} onChange={(event) => onChange({ ...value, source: event.target.value })} required />
      </label>
      <label className="full-width">
        Message
        <textarea value={value.message} onChange={(event) => onChange({ ...value, message: event.target.value })} required />
      </label>
      <button type="submit">{submitLabel}</button>
    </form>
  );
}

function CreatePage() {
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      const created = await createLog({ ...form, timestamp: toApiTimestamp(form.timestamp) });
      setStatus(`Saved log #${created.id}`);
      setForm({ ...emptyForm, timestamp: new Date().toISOString().slice(0, 16) });
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <Layout>
      <LogForm value={form} onChange={setForm} onSubmit={handleSubmit} submitLabel="Create log" />
      {status ? <p className="status">{status}</p> : null}
    </Layout>
  );
}

function DetailPage() {
  const logId = window.location.pathname.split('/').at(-1);
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState('');

  useEffect(() => {
    fetchLog(logId)
      .then((item) => {
        setForm({
          timestamp: item.timestamp.slice(0, 16),
          message: item.message,
          severity: item.severity,
          source: item.source,
        });
      })
      .catch((error) => setStatus(error.message));
  }, [logId]);

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      await updateLog(logId, { ...form, timestamp: toApiTimestamp(form.timestamp) });
      setStatus('Saved changes');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function handleDelete() {
    try {
      await deleteLog(logId);
      window.location.href = '/';
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <Layout>
      <LogForm value={form} onChange={setForm} onSubmit={handleSubmit} submitLabel="Save changes" />
      <button className="danger-button" onClick={handleDelete}>
        Delete log
      </button>
      {status ? <p className="status">{status}</p> : null}
    </Layout>
  );
}

function LineChart({ points }) {
  const chartPoints = useMemo(() => {
    if (!points.length) {
      return '';
    }
    const max = Math.max(...points.map((point) => point.count), 1);
    return points
      .map((point, index) => {
        const x = (index / Math.max(points.length - 1, 1)) * 100;
        const y = 100 - (point.count / max) * 100;
        return `${x},${y}`;
      })
      .join(' ');
  }, [points]);

  return (
    <div className="chart-card">
      <div className="section-header">
        <h2>Trend</h2>
        <span>Logs over time</span>
      </div>
      <svg viewBox="0 0 100 100" className="chart">
        <polyline fill="none" stroke="currentColor" strokeWidth="2" points={chartPoints} />
      </svg>
      <div className="chart-labels">
        {points.map((point) => (
          <span key={point.bucket}>{point.bucket}</span>
        ))}
      </div>
    </div>
  );
}

function DashboardPage() {
  const [filters, setFilters] = useState({ search: '', severity: '', source: '', start_date: '', end_date: '' });
  const [aggregate, setAggregate] = useState({ total: 0, by_severity: {}, by_source: {}, daily_counts: [] });
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAggregate(filters)
      .then((payload) => {
        setAggregate(payload);
        setError('');
      })
      .catch((requestError) => setError(requestError.message));
  }, [filters]);

  const sources = Object.keys(aggregate.by_source);

  return (
    <Layout>
      <Filters filters={{ ...filters, page: 1, page_size: 6, sort_by: 'timestamp', sort_order: 'desc' }} setFilters={setFilters} sources={sources} />
      {error ? <p className="status error">{error}</p> : null}
      <section className="stats-grid">
        <article className="card">
          <p className="muted">Total logs</p>
          <strong>{aggregate.total}</strong>
        </article>
        <article className="card">
          <p className="muted">Severities</p>
          <strong>{Object.keys(aggregate.by_severity).length}</strong>
        </article>
        <article className="card">
          <p className="muted">Sources</p>
          <strong>{sources.length}</strong>
        </article>
      </section>
      <section className="dashboard-grid">
        <article className="card">
          <div className="section-header">
            <h2>By severity</h2>
          </div>
          {Object.entries(aggregate.by_severity).map(([key, value]) => (
            <div className="metric-row" key={key}>
              <span>{key}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </article>
        <article className="card">
          <div className="section-header">
            <h2>By source</h2>
          </div>
          {Object.entries(aggregate.by_source).map(([key, value]) => (
            <div className="metric-row" key={key}>
              <span>{key}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </article>
      </section>
      <LineChart points={aggregate.daily_counts} />
    </Layout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LogsPage />} />
      <Route path="/new" element={<CreatePage />} />
      <Route path="/logs/:id" element={<DetailPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
    </Routes>
  );
}
