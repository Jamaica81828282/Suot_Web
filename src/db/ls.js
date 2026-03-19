// LocalStorage namespacing helper — keeps per-user keys
export function nsKey(base) {
  const uid = localStorage.getItem('suotUserId') || 'anon'
  return `suot_${base}_${uid}`
}

export function lsGet(base, fallback = null) {
  const raw = localStorage.getItem(nsKey(base))
  return raw ? JSON.parse(raw) : fallback
}

export function lsSet(base, data) {
  localStorage.setItem(nsKey(base), JSON.stringify(data))
}

export function lsRemove(base) {
  localStorage.removeItem(nsKey(base))
}
