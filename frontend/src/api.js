const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

function buildQuery(params) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === '' || value === null || value === undefined) {
      return;
    }

    if (key === 'start_date' && typeof value === 'string' && value.length === 10) {
      query.set(key, `${value}T00:00:00`);
      return;
    }

    if (key === 'end_date' && typeof value === 'string' && value.length === 10) {
      query.set(key, `${value}T23:59:59`);
      return;
    }

    query.set(key, value);
  });

  return query.toString();
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || 'Request failed');
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export function fetchLogs(params) {
  return request(`/api/logs?${buildQuery(params)}`);
}

export function fetchLog(id) {
  return request(`/api/logs/${id}`);
}

export function createLog(payload) {
  return request('/api/logs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateLog(id, payload) {
  return request(`/api/logs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteLog(id) {
  return request(`/api/logs/${id}`, {
    method: 'DELETE',
  });
}

export function fetchAggregate(params) {
  return request(`/api/logs/query/aggregate?${buildQuery(params)}`);
}

export function fetchRawLogs(params) {
  return request(`/api/logs/query/raw?${buildQuery(params)}`);
}
