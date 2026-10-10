// A bounded index, not a second clock or an alternative event schema.
export function validateHistoryIndex(index) {
  if (index?.schemaVersion !== 1 || index.kind !== 'monthly-event-index'
    || !Array.isArray(index.chunks) || !index.chunks.length || index.chunks.length > 10000) throw new Error('Unsupported history index.');
  let previous = -Infinity;
  const ids = new Set();
  for (const chunk of index.chunks) {
    const [start,end] = (chunk.intervalUtc ?? []).map(Date.parse);
    if (!/^\d{4}-\d{2}(?:-\d{3})?$/.test(chunk.id) || ids.has(chunk.id) || chunk.asset !== `${chunk.id}.json${chunk.encoding === 'gzip' ? '.gz' : ''}`
      || ![undefined,'gzip'].includes(chunk.encoding)
      || chunk.encoding === 'gzip' && (!Number.isInteger(chunk.decodedBytes) || chunk.decodedBytes<1 || chunk.decodedBytes>2000000)
      || !Number.isFinite(start) || !Number.isFinite(end) || start < previous || start >= end || end-start > 31*86400000
      || !Number.isInteger(chunk.eventCount) || chunk.eventCount < 1 || chunk.eventCount > 50
      || !Number.isInteger(chunk.bytes) || chunk.bytes < 1 || chunk.bytes > 2000000
      || !/^[a-f0-9]{64}$/.test(chunk.sha256)) throw new Error('Invalid history chunk bounds or identity.');
    previous = end; ids.add(chunk.id);
  }
  if (!ids.has(index.defaultChunk)) throw new Error('Missing default history chunk.');
  return index;
}

export async function loadHistoryChunk(chunk, indexUrl, fetchText) {
  const payload = await fetchText(new URL(chunk.asset,indexUrl));
  const bytes = typeof payload === 'string' ? new TextEncoder().encode(payload) : new Uint8Array(payload);
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  if (bytes.length !== chunk.bytes || digest !== chunk.sha256) throw new Error('Historical passage checksum mismatch; rebuild its index.');
  const decoded = chunk.encoding === 'gzip' ? new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()) : bytes;
  if (chunk.encoding === 'gzip' && decoded.length !== chunk.decodedBytes) throw new Error('Historical passage decoded size mismatch.');
  const manifest = JSON.parse(new TextDecoder().decode(decoded));
  if (manifest.schemaVersion !== 3 || manifest.events?.length !== chunk.eventCount
    || manifest.sample?.id !== chunk.id || manifest.sample.eventCount !== chunk.eventCount
    || JSON.stringify(manifest.sample.intervalUtc) !== JSON.stringify(chunk.intervalUtc)) throw new Error('Historical passage does not match its index.');
  return manifest; // loadSequence still validates catalog membership and geometry before installation.
}
