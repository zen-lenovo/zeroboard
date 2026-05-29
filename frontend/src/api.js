const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

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
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) {
      query.set(key, value);
    }
  });
  return request(`/api/logs?${query.toString()}`);
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
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) {
      query.set(key, value);
    }
  });
  return request(`/api/logs/query/aggregate?${query.toString()}`);
}
