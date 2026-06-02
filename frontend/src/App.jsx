import { NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { createLog, deleteLog, fetchAggregate, fetchLog, fetchLogs, fetchRawLogs, updateLog } from './api';

const severityOptions = ['debug', 'info', 'warning', 'error'];
const severityRank = { error: 4, warning: 3, info: 2, debug: 1 };
const severityColor = {
  error: '#c2410c',
  warning: '#f59e0b',
  info: '#0f766e',
  debug: '#2563eb',
};

const emptyForm = {
  timestamp: new Date().toISOString().slice(0, 16),
  message: '',
  severity: 'info',
  source: '',
};

function toApiTimestamp(value) {
  return new Date(value).toISOString();
}

function formatDateTime(value) {
  return new Date(value).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function buildCsv(rows) {
  const columns = ['id', 'timestamp', 'severity', 'source', 'message'];
  const lines = [columns.join(',')];

  rows.forEach((row) => {
    const serialized = columns.map((column) => `"${String(row[column] ?? '').replaceAll('"', '""')}"`);
    lines.push(serialized.join(','));
  });

  return lines.join('\n');
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Layout({ children }) {
  return (
    <div className="page-shell">
      <header className="hero-shell">
        <div className="topbar">
          <div>
            <p className="eyebrow">Operational insight for fast-moving teams</p>
            <h1>Logs Dashboard</h1>
            <p className="hero-copy">
              Search raw events, edit incident details, and track severity trends from one workspace.
            </p>
          </div>
          <nav className="nav-tabs" aria-label="Primary navigation">
            <NavLink to="/" end>
              Logs
            </NavLink>
            <NavLink to="/new">Create</NavLink>
            <NavLink to="/dashboard">Analytics</NavLink>
          </nav>
        </div>
      </header>
      <main className="content-stack">{children}</main>
    </div>
  );
}

function StatusBanner({ children, tone = 'info' }) {
  if (!children) {
    return null;
  }

  return <p className={`status ${tone}`}>{children}</p>;
}

function EmptyState({ title, description, action }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

function PageIntro({ eyebrow, title, description, actions }) {
  return (
    <section className="page-intro card accent-card">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="intro-copy">{description}</p>
      </div>
      {actions ? <div className="intro-actions">{actions}</div> : null}
    </section>
  );
}

function SeverityPill({ value }) {
  return <span className={`pill ${value}`}>{value}</span>;
}

function SummaryCards({ items }) {
  return (
    <section className="stats-grid">
      {items.map((item) => (
        <article className="card stat-card" key={item.label}>
          <p className="muted">{item.label}</p>
          <strong>{item.value}</strong>
          <span>{item.caption}</span>
        </article>
      ))}
    </section>
  );
}

function FilterPanel({ filters, setFilters, sources, onReset, actions, showSearch = true, showSorting = true }) {
  function updateField(name, value, resetPage = true) {
    setFilters((current) => ({
      ...current,
      [name]: value,
      ...(resetPage && Object.prototype.hasOwnProperty.call(current, 'page') ? { page: 1 } : {}),
    }));
  }

  return (
    <section className="card filter-panel">
      <div className="section-header compact-header">
        <div>
          <h3>Filter panel</h3>
          <p className="muted">Refine by time, severity, source, and message content.</p>
        </div>
        <div className="panel-actions">
          {actions}
          <button className="secondary-button" type="button" onClick={onReset}>
            Clear filters
          </button>
        </div>
      </div>
      <div className="filters-grid">
        {showSearch ? (
          <label>
            Search
            <input
              placeholder="Message or source"
              value={filters.search}
              onChange={(event) => updateField('search', event.target.value)}
            />
          </label>
        ) : null}
        <label>
          Severity
          <select value={filters.severity} onChange={(event) => updateField('severity', event.target.value)}>
            <option value="">All severities</option>
            {severityOptions.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source
          <select value={filters.source} onChange={(event) => updateField('source', event.target.value)}>
            <option value="">All sources</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </label>
        {showSorting ? (
          <label>
            Sort by
            <select value={filters.sort_by} onChange={(event) => updateField('sort_by', event.target.value, false)}>
              <option value="timestamp">Timestamp</option>
              <option value="severity">Severity</option>
              <option value="source">Source</option>
            </select>
          </label>
        ) : null}
        {showSorting ? (
          <label>
            Order
            <select value={filters.sort_order} onChange={(event) => updateField('sort_order', event.target.value, false)}>
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </label>
        ) : null}
        <label>
          Start date
          <input type="date" value={filters.start_date} onChange={(event) => updateField('start_date', event.target.value)} />
        </label>
        <label>
          End date
          <input type="date" value={filters.end_date} onChange={(event) => updateField('end_date', event.target.value)} />
        </label>
      </div>
    </section>
  );
}

function LogsPage() {
  const defaultFilters = {
    page: 1,
    page_size: 6,
    search: '',
    severity: '',
    source: '',
    sort_by: 'timestamp',
    sort_order: 'desc',
    start_date: '',
    end_date: '',
  };
  const [filters, setFilters] = useState(defaultFilters);
  const [data, setData] = useState({ items: [], total: 0, page: 1, page_size: 6 });
  const [aggregate, setAggregate] = useState({ total: 0, by_severity: {}, by_source: {}, daily_counts: [] });
  const [sources, setSources] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([fetchLogs(filters), fetchAggregate(filters)])
      .then(([logs, aggregate]) => {
        if (!active) {
          return;
        }
        setData(logs);
        setAggregate(aggregate);
        setSources(Object.keys(aggregate.by_source));
        setError('');
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [filters]);

  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));
  const topSource = useMemo(() => {
    const entries = Object.entries(aggregate.by_source);
    if (!entries.length) {
      return 'No source data';
    }
    const [source, count] = entries.sort((left, right) => right[1] - left[1])[0];
    return `${source} · ${count}`;
  }, [aggregate.by_source]);
  const highestSeverity = useMemo(() => {
    const severities = Object.keys(aggregate.by_severity);
    if (!severities.length) {
      return 'None';
    }
    return severities.sort((left, right) => severityRank[right] - severityRank[left])[0];
  }, [aggregate.by_severity]);

  return (
    <Layout>
      <PageIntro
        eyebrow="Log operations"
        title="Search, triage, and maintain raw events"
        description="The list view combines search, filtering, sorting, and pagination so analysts can move from broad scans into single-log edits without losing context."
        actions={<NavLink className="primary-link" to="/new">Create a new log</NavLink>}
      />
      <SummaryCards
        items={[
          { label: 'Visible logs', value: aggregate.total, caption: 'Count after active filters' },
          { label: 'Highest severity', value: highestSeverity, caption: 'Worst active severity bucket' },
          { label: 'Busiest source', value: topSource, caption: 'Most frequent source in scope' },
        ]}
      />
      <FilterPanel filters={filters} setFilters={setFilters} sources={sources} onReset={() => setFilters(defaultFilters)} />
      <StatusBanner tone="error">{error}</StatusBanner>
      <section className="card">
        <div className="section-header">
          <div>
            <h2>All logs</h2>
            <p className="muted">Paginated raw events from the REST API.</p>
          </div>
          <span>{data.total} entries</span>
        </div>
        {loading ? <p className="muted">Loading logs...</p> : null}
        {!loading && data.items.length ? (
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
                    <td>{formatDateTime(item.timestamp)}</td>
                    <td>
                      <SeverityPill value={item.severity} />
                    </td>
                    <td>{item.source}</td>
                    <td>{item.message}</td>
                    <td>
                      <NavLink className="text-link" to={`/logs/${item.id}`}>
                        Open detail
                      </NavLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {!loading && !data.items.length ? (
          <EmptyState
            title="No logs match these filters"
            description="Clear the current filters or create a new log entry to start populating the dashboard."
            action={<NavLink className="primary-link" to="/new">Create log</NavLink>}
          />
        ) : null}
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
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await createLog({ ...form, timestamp: toApiTimestamp(form.timestamp) });
      setStatus(`Saved log #${created.id}`);
      setForm({ ...emptyForm, timestamp: new Date().toISOString().slice(0, 16) });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <PageIntro
        eyebrow="Creation"
        title="Add a new log entry"
        description="Capture timestamp, source, severity, and message details so the log immediately becomes queryable from both the list and the analytics dashboard."
      />
      <div className="detail-grid">
        <LogForm value={form} onChange={setForm} onSubmit={handleSubmit} submitLabel={saving ? 'Saving...' : 'Create log'} />
        <aside className="card info-panel">
          <h3>Authoring guidance</h3>
          <ul className="plain-list">
            <li>Use consistent source names so filters stay meaningful.</li>
            <li>Reserve error and warning severities for operationally actionable events.</li>
            <li>Write messages that can stand alone during incident review.</li>
          </ul>
        </aside>
      </div>
      <StatusBanner>{status}</StatusBanner>
    </Layout>
  );
}

function DetailPage() {
  const { id: logId } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!logId) {
      setLoading(false);
      setStatus('Log not found');
      return undefined;
    }

    let active = true;
    setLoading(true);

    fetchLog(logId)
      .then((item) => {
        if (!active) {
          return;
        }
        setForm({
          timestamp: item.timestamp.slice(0, 16),
          message: item.message,
          severity: item.severity,
          source: item.source,
        });
        setStatus('');
      })
      .catch((error) => {
        if (active) {
          setStatus(error.message);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
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
      if (!window.confirm('Delete this log entry? This action cannot be undone.')) {
        return;
      }
      await deleteLog(logId);
      navigate('/');
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <Layout>
      <PageIntro
        eyebrow="Log detail"
        title={`Review log #${logId}`}
        description="Inspect the event, update its attributes, or remove it if the entry is no longer needed."
        actions={<button className="secondary-button" type="button" onClick={() => navigate('/')}>Back to logs</button>}
      />
      <div className="detail-grid">
        <div className="content-stack">
          {loading ? <p className="muted">Loading log details...</p> : null}
          <LogForm value={form} onChange={setForm} onSubmit={handleSubmit} submitLabel="Save changes" />
          <button className="danger-button" type="button" onClick={handleDelete}>
            Delete log
          </button>
          <StatusBanner>{status}</StatusBanner>
        </div>
        <aside className="card info-panel">
          <h3>Entry snapshot</h3>
          <div className="snapshot-grid">
            <div>
              <span className="muted">Severity</span>
              <SeverityPill value={form.severity} />
            </div>
            <div>
              <span className="muted">Source</span>
              <strong>{form.source || 'Unassigned'}</strong>
            </div>
            <div>
              <span className="muted">Timestamp</span>
              <strong>{form.timestamp ? formatDateTime(form.timestamp) : 'Unavailable'}</strong>
            </div>
          </div>
        </aside>
      </div>
    </Layout>
  );
}

function LineChart({ points }) {
  const chartData = useMemo(() => {
    if (!points.length) {
      return { polyline: '', area: '', max: 0 };
    }

    const max = Math.max(...points.map((point) => point.count), 1);
    const pairs = points.map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * 100;
      const y = 100 - (point.count / max) * 100;
      return { x, y, label: point.bucket, count: point.count };
    });

    return {
      max,
      polyline: pairs.map((point) => `${point.x},${point.y}`).join(' '),
      area: ['0,100', ...pairs.map((point) => `${point.x},${point.y}`), '100,100'].join(' '),
      pairs,
    };
  }, [points]);

  return (
    <div className="chart-card">
      <div className="section-header">
        <div>
          <h2>Trend over time</h2>
          <p className="muted">Log counts per day for the active filter selection.</p>
        </div>
      </div>
      {!points.length ? (
        <EmptyState title="No trend data" description="Apply a broader date range or remove filters to populate the time series." />
      ) : (
        <>
          <svg viewBox="0 0 100 100" className="chart" preserveAspectRatio="none">
            <defs>
              <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(16, 185, 129, 0.35)" />
                <stop offset="100%" stopColor="rgba(16, 185, 129, 0.02)" />
              </linearGradient>
            </defs>
            <polygon fill="url(#trend-fill)" points={chartData.area} />
            <polyline fill="none" stroke="currentColor" strokeWidth="2.4" points={chartData.polyline} />
            {chartData.pairs.map((point) => (
              <circle key={point.label} cx={point.x} cy={point.y} r="1.8" fill="currentColor" />
            ))}
          </svg>
          <div className="chart-labels">
            {chartData.pairs.map((point) => (
              <span key={point.label}>{`${point.label} · ${point.count}`}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DistributionChart({ entries, title, emptyLabel }) {
  const max = Math.max(...entries.map(([, value]) => value), 1);

  return (
    <article className="card chart-card">
      <div className="section-header">
        <div>
          <h2>{title}</h2>
          <p className="muted">Relative volume in the current dataset.</p>
        </div>
      </div>
      {!entries.length ? (
        <EmptyState title="No distribution yet" description={emptyLabel} />
      ) : (
        <div className="bars-stack">
          {entries.map(([label, value]) => (
            <div className="bar-row" key={label}>
              <div className="bar-meta">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(value / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function SeverityShareChart({ entries, total }) {
  const chartStyle = useMemo(() => {
    if (!entries.length || !total) {
      return { background: 'conic-gradient(from 180deg, rgba(17, 35, 49, 0.08), rgba(17, 35, 49, 0.16))' };
    }

    let offset = 0;
    const segments = entries.map(([label, value]) => {
      const start = offset;
      offset += (value / total) * 360;
      return `${severityColor[label] || '#64748b'} ${start}deg ${offset}deg`;
    });

    return { background: `conic-gradient(${segments.join(', ')})` };
  }, [entries, total]);

  return (
    <article className="card chart-card">
      <div className="section-header">
        <div>
          <h2>Severity share</h2>
          <p className="muted">A quick read on how much of the current volume is operationally risky.</p>
        </div>
      </div>
      {!entries.length ? (
        <EmptyState title="No severity mix yet" description="Create or broaden logs to reveal the current risk composition." />
      ) : (
        <div className="donut-layout">
          <div className="donut-shell">
            <div className="donut-chart" style={chartStyle} aria-hidden="true" />
            <div className="donut-hole">
              <strong>{total}</strong>
              <span>logs</span>
            </div>
          </div>
          <div className="legend-stack">
            {entries.map(([label, value]) => (
              <div className="legend-row" key={label}>
                <div className="legend-label">
                  <span className="legend-dot" style={{ backgroundColor: severityColor[label] || '#64748b' }} />
                  <span>{label}</span>
                </div>
                <strong>{Math.round((value / total) * 100)}%</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function WeekdayPatternChart({ points }) {
  const weekdayData = useMemo(() => {
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = labels.map((label) => ({ label, count: 0 }));

    points.forEach((point) => {
      const dayIndex = new Date(`${point.bucket}T00:00:00`).getDay();
      counts[dayIndex].count += point.count;
    });

    return counts;
  }, [points]);

  const max = Math.max(...weekdayData.map((entry) => entry.count), 1);

  return (
    <article className="card chart-card">
      <div className="section-header">
        <div>
          <h2>Weekly rhythm</h2>
          <p className="muted">Daily totals regrouped by weekday to expose recurring noisy windows.</p>
        </div>
      </div>
      {!points.length ? (
        <EmptyState title="No cadence data" description="Once daily counts exist, this chart will highlight the busiest weekdays." />
      ) : (
        <div className="weekday-chart" role="img" aria-label="Log counts grouped by weekday">
          {weekdayData.map((entry) => (
            <div className="weekday-column" key={entry.label}>
              <span className="weekday-value">{entry.count}</span>
              <div className="weekday-track">
                <div className="weekday-fill" style={{ height: `${(entry.count / max) * 100}%` }} />
              </div>
              <span className="weekday-label">{entry.label}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function DashboardPage() {
  const defaultFilters = { search: '', severity: '', source: '', start_date: '', end_date: '' };
  const [filters, setFilters] = useState(defaultFilters);
  const [aggregate, setAggregate] = useState({ total: 0, by_severity: {}, by_source: {}, daily_counts: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloadStatus, setDownloadStatus] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetchAggregate(filters)
      .then((payload) => {
        if (!active) {
          return;
        }
        setAggregate(payload);
        setError('');
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [filters]);

  const sources = Object.keys(aggregate.by_source);
  const severityEntries = Object.entries(aggregate.by_severity).sort((left, right) => severityRank[right[0]] - severityRank[left[0]]);
  const sourceEntries = Object.entries(aggregate.by_source).sort((left, right) => right[1] - left[1]);

  async function handleDownload() {
    try {
      const rows = await fetchRawLogs(filters);
      downloadTextFile('logs-export.csv', buildCsv(rows));
      setDownloadStatus(`Downloaded ${rows.length} rows as CSV.`);
    } catch (requestError) {
      setDownloadStatus(requestError.message);
    }
  }

  return (
    <Layout>
      <PageIntro
        eyebrow="Analytics"
        title="Understand trend lines and source concentration"
        description="The dashboard surfaces aggregated metrics by severity, source, and day so operators can spot bursts, noisy services, and changing risk quickly."
        actions={<button type="button" onClick={handleDownload}>Download CSV</button>}
      />
      <FilterPanel
        filters={filters}
        setFilters={setFilters}
        sources={sources}
        onReset={() => setFilters(defaultFilters)}
        actions={loading ? <span className="muted">Refreshing...</span> : null}
        showSorting={false}
      />
      <StatusBanner tone="error">{error}</StatusBanner>
      <StatusBanner>{downloadStatus}</StatusBanner>
      <SummaryCards
        items={[
          { label: 'Total logs', value: aggregate.total, caption: 'Events inside the active filter window' },
          { label: 'Severity buckets', value: severityEntries.length, caption: 'Distinct severities represented' },
          { label: 'Sources', value: sourceEntries.length, caption: 'Distinct systems represented' },
        ]}
      />
      <section className="dashboard-grid three-up">
        <DistributionChart
          entries={severityEntries}
          title="Severity distribution"
          emptyLabel="No severity data is available for the current selection."
        />
        <DistributionChart
          entries={sourceEntries.slice(0, 6)}
          title="Top sources"
          emptyLabel="No source data is available for the current selection."
        />
        <article className="card insight-card">
          <h2>Key takeaways</h2>
          <ul className="plain-list">
            <li>{aggregate.total ? `The current slice contains ${aggregate.total} total logs.` : 'No logs are visible for the selected filters.'}</li>
            <li>
              {severityEntries.length
                ? `${severityEntries[0][0]} is the dominant severity with ${severityEntries[0][1]} entries.`
                : 'Severity trends will appear once logs are available.'}
            </li>
            <li>
              {sourceEntries.length
                ? `${sourceEntries[0][0]} is the noisiest source in this view.`
                : 'Source concentration will appear once logs are available.'}
            </li>
          </ul>
        </article>
        <SeverityShareChart entries={severityEntries} total={aggregate.total} />
        <WeekdayPatternChart points={aggregate.daily_counts} />
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
