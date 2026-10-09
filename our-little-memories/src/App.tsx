import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { configured, supabase } from './lib/supabase'

type Album = { id: string; title: string; subtitle: string }
type Memory = { id: string; title: string; date: string | null; location: string | null; description: string }
type Photo = { id: string; memory_id: string; storage_path: string; caption: string; favorite: boolean }
type Up = { key: string; file: File; memoryId: string; status: 'uploading' | 'failed'; error?: string }
type Conn = 'synced' | 'connecting' | 'offline'

const BUCKET = 'album-photos'
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_MB = 10
const FRIENDLY = 'Terjadi masalah saat menyimpan. Coba lagi ya.'
const CONN_LABEL: Record<Conn, string> = { synced: 'Synced', connecting: 'Connecting...', offline: 'Offline' }

async function signedUrls(paths: string[]) {
  const out: Record<string, string> = {}
  if (!paths.length) return out
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 21600)
  data?.forEach(d => { if (d.path && d.signedUrl) out[d.path] = d.signedUrl })
  return out
}

const ALBUM_EMAIL = 'dillahsajaya@gmail.com'
const ALBUM_PASSWORD = 'qd6gilwaxIfcBEgqXo'

function Cover() {
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function openAlbum() {
    if (busy) return
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email: ALBUM_EMAIL, password: ALBUM_PASSWORD })
    if (error) setErr('Album belum bisa dibuka. Coba lagi sebentar ya.')
    setBusy(false)
  }
  return (
    <div className="center">
      <div className="paper login">
        <h1>OUR LITTLE<br />MEMORIES ♡</h1>
        <p className="hand">A collection of moments worth remembering.</p>
        {err && <p className="err">{err}</p>}
        <button className="btn primary" onClick={openAlbum} disabled={busy}>{busy ? 'Membuka…' : 'OPEN OUR ALBUM'}</button>
      </div>
    </div>
  )
}

function Polaroid(props: {
  p: Photo; url?: string; edit: boolean
  onOpen: () => void; onFav: () => void; onCap: () => void; onDel: () => void
}) {
  const { p, url, edit } = props
  return (
    <figure className="polaroid">
      {url ? <img src={url} alt={p.caption || 'Foto kenangan'} loading="lazy" onClick={props.onOpen} /> : <div className="ph">…</div>}
      <figcaption className="hand">{p.caption || (edit ? '(tanpa caption)' : '')}</figcaption>
      <div className="pbar">
        <button aria-label="Favorit" className={p.favorite ? 'heart on' : 'heart'} onClick={props.onFav}>{p.favorite ? '♥' : '♡'}</button>
        {edit && <>
          <button onClick={props.onCap}>Caption</button>
          <button onClick={props.onDel}>Hapus</button>
        </>}
      </div>
    </figure>
  )
}

function AddForm({ onCreate, onCancel }: {
  onCreate: (f: { title: string; date: string; location: string; description: string }, files: File[]) => Promise<boolean>
  onCancel: () => void
}) {
  const [f, setF] = useState({ title: '', date: '', location: '', description: '' })
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !f.title.trim()) return
    setBusy(true)
    const ok = await onCreate(f, files)
    setBusy(false)
    if (ok) onCancel()
  }
  return (
    <form className="paper addform" onSubmit={submit}>
      <h3>Memori baru ♡</h3>
      <input placeholder="Judul" value={f.title} maxLength={160} onChange={e => setF({ ...f, title: e.target.value })} required />
      <input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
      <input placeholder="Lokasi" value={f.location} maxLength={160} onChange={e => setF({ ...f, location: e.target.value })} />
      <textarea placeholder="Cerita singkat…" rows={3} value={f.description} maxLength={5000} onChange={e => setF({ ...f, description: e.target.value })} />
      <input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={e => setFiles(Array.from(e.target.files || []))} />
      <p className="small">{files.length ? `${files.length} foto dipilih` : 'JPG, PNG, atau WEBP · maks. 10 MB per foto'}</p>
      <div className="row">
        <button className="btn primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>Batal</button>
      </div>
    </form>
  )
}

function AlbumView({ session }: { session: Session }) {
  const [albumId, setAlbumId] = useState<string | null>(null)
  const [album, setAlbum] = useState<Album | null>(null)
  const [memories, setMemories] = useState<Memory[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [conn, setConn] = useState<Conn>('connecting')
  const [tab, setTab] = useState<'memories' | 'favorites'>('memories')
  const [edit, setEdit] = useState(false)
  const [adding, setAdding] = useState(false)
  const [ups, setUps] = useState<Up[]>([])
  const [view, setView] = useState<{ ids: string[]; i: number } | null>(null)
  const urlsRef = useRef<Record<string, string>>({})
  const albumIdRef = useRef<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const refresh = useCallback(async () => {
    try {
      let id = albumIdRef.current
      if (!id) {
        const { data, error } = await supabase.from('album_members').select('album_id').eq('user_id', session.user.id).maybeSingle()
        if (error) throw error
        id = data?.album_id ?? null
        albumIdRef.current = id
        setAlbumId(id)
      }
      if (!id) return
      const [a, m, p] = await Promise.all([
        supabase.from('albums').select('id,title,subtitle').eq('id', id).single(),
        supabase.from('memories').select('id,title,date,location,description').eq('album_id', id)
          .order('date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
        supabase.from('photos').select('id,memory_id,storage_path,caption,favorite').eq('album_id', id)
          .order('display_order').order('created_at'),
      ])
      const e = a.error || m.error || p.error
      if (e) throw e
      setAlbum(a.data as Album); setMemories(m.data as Memory[]); setPhotos(p.data as Photo[])
      const need = (p.data as Photo[]).map(x => x.storage_path).filter(x => !urlsRef.current[x])
      if (need.length) { urlsRef.current = { ...urlsRef.current, ...(await signedUrls(need)) }; setUrls(urlsRef.current) }
      setErr('')
    } catch {
      setErr('Gagal memuat album. Cek koneksi lalu coba lagi.')
    } finally {
      setLoading(false)
    }
  }, [session.user.id])

  useEffect(() => { refresh() }, [refresh])

  // Realtime: any change to this album triggers a (debounced) re-fetch of authoritative state.
  useEffect(() => {
    if (!albumId) return
    const soon = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(refresh, 250) }
    const ch = supabase.channel('album-' + albumId)
    for (const table of ['memories', 'photos', 'albums']) {
      ch.on('postgres_changes',
        { event: '*', schema: 'public', table, filter: table === 'albums' ? `id=eq.${albumId}` : `album_id=eq.${albumId}` }, soon)
    }
    ch.subscribe(s => {
      if (s === 'SUBSCRIBED') { setConn('synced'); refresh() }
      else if (s === 'CLOSED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setConn('offline')
      else setConn('connecting')
    })
    const off = () => setConn('offline')
    const on = () => { setConn('connecting'); refresh() }
    window.addEventListener('offline', off); window.addEventListener('online', on)
    return () => {
      window.clearTimeout(timer.current)
      window.removeEventListener('offline', off); window.removeEventListener('online', on)
      supabase.removeChannel(ch)
    }
  }, [albumId, refresh])

  async function uploadFile(file: File, memoryId: string, order: number): Promise<string | null> {
    if (!OK_TYPES.includes(file.type)) return 'Format tidak didukung (pakai JPG, PNG, atau WEBP).'
    if (file.size > MAX_MB * 1024 * 1024) return `Foto terlalu besar (maksimal ${MAX_MB} MB).`
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${albumId}/${memoryId}/${crypto.randomUUID()}.${ext}`
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
    if (up.error) return FRIENDLY
    const ins = await supabase.from('photos').insert({ album_id: albumId, memory_id: memoryId, storage_path: path, display_order: order })
    if (ins.error) { await supabase.storage.from(BUCKET).remove([path]); return FRIENDLY }
    return null
  }

  async function runUp(it: Up, order: number) {
    setUps(u => u.map(x => (x.key === it.key ? { ...x, status: 'uploading', error: undefined } : x)))
    const e = await uploadFile(it.file, it.memoryId, order)
    setUps(u => (e ? u.map(x => (x.key === it.key ? { ...x, status: 'failed', error: e } : x)) : u.filter(x => x.key !== it.key)))
  }

  async function addPhotos(memoryId: string, files: File[]) {
    const base = photos.filter(p => p.memory_id === memoryId).length
    const items: Up[] = files.map(file => ({ key: crypto.randomUUID(), file, memoryId, status: 'uploading' }))
    setUps(u => [...u, ...items])
    await Promise.all(items.map((it, i) => runUp(it, base + i)))
    refresh()
  }

  async function createMemory(f: { title: string; date: string; location: string; description: string }, files: File[]) {
    const { data, error } = await supabase.from('memories')
      .insert({ album_id: albumId, title: f.title.trim(), date: f.date || null, location: f.location.trim() || null, description: f.description })
      .select('id').single()
    if (error || !data) { setErr(FRIENDLY); return false }
    await refresh()
    if (files.length) addPhotos(data.id, files)
    return true
  }

  async function toggleFav(p: Photo) {
    setPhotos(l => l.map(x => (x.id === p.id ? { ...x, favorite: !x.favorite } : x)))
    const { error } = await supabase.from('photos').update({ favorite: !p.favorite }).eq('id', p.id)
    if (error) { setErr(FRIENDLY); refresh() }
  }
  async function editCaption(p: Photo) {
    const v = prompt('Caption:', p.caption)
    if (v === null) return
    const { error } = await supabase.from('photos').update({ caption: v.slice(0, 500) }).eq('id', p.id)
    if (error) setErr(FRIENDLY); else refresh()
  }
  async function delPhoto(p: Photo) {
    if (!confirm('Hapus foto ini?')) return
    const { error } = await supabase.from('photos').delete().eq('id', p.id)
    if (error) { setErr(FRIENDLY); return }
    await supabase.storage.from(BUCKET).remove([p.storage_path])
    refresh()
  }
  async function editMemory(m: Memory) {
    const t = prompt('Judul:', m.title)
    if (!t || !t.trim()) return
    const { error } = await supabase.from('memories').update({ title: t.trim() }).eq('id', m.id)
    if (error) setErr(FRIENDLY); else refresh()
  }
  async function delMemory(m: Memory) {
    if (!confirm(`Hapus "${m.title}" beserta semua fotonya?`)) return
    const paths = photos.filter(p => p.memory_id === m.id).map(p => p.storage_path)
    const { error } = await supabase.from('memories').delete().eq('id', m.id)
    if (error) { setErr(FRIENDLY); return }
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
    refresh()
  }

  if (loading) return <p className="center">Loading…</p>
  if (!albumId || !album) return (
    <div className="center"><div className="paper login">
      <p>Akunmu belum terdaftar di album mana pun.</p>
      <button className="btn" onClick={() => supabase.auth.signOut()}>Keluar</button>
    </div></div>
  )

  const places = new Set(memories.map(m => (m.location || '').trim().toLowerCase()).filter(Boolean)).size
  const favs = photos.filter(p => p.favorite)
  const mTitle = (id: string) => memories.find(m => m.id === id)?.title || ''
  const open = (list: Photo[], i: number) => setView({ ids: list.map(p => p.id), i })
  const cur = view ? photos.find(p => p.id === view.ids[view.i]) : null

  const card = (p: Photo, list: Photo[], i: number) => (
    <Polaroid key={p.id} p={p} url={urls[p.storage_path]} edit={edit}
      onOpen={() => open(list, i)} onFav={() => toggleFav(p)} onCap={() => editCaption(p)} onDel={() => delPhoto(p)} />
  )

  return (
    <div className="wrap">
      <header>
        <div>
          <h1>{album.title} ♡</h1>
          <p className="hand">{album.subtitle}</p>
        </div>
        <div className="hdr">
          <span className={`pill ${conn}`}>{CONN_LABEL[conn]}</span>
          <button className="btn" onClick={() => { setEdit(!edit); setAdding(false) }}>{edit ? 'DONE' : 'EDIT ALBUM'}</button>
        </div>
      </header>

      {err && <p className="err banner">{err} <button onClick={() => { setErr(''); refresh() }}>Coba lagi</button></p>}

      <p className="stats hand">OUR STORY ♡ — {memories.length} memories · {photos.length} photos · {places} places</p>

      <nav>
        <button className={tab === 'memories' ? 'on' : ''} onClick={() => setTab('memories')}>Memories</button>
        <button className={tab === 'favorites' ? 'on' : ''} onClick={() => setTab('favorites')}>Favorites ♥</button>
      </nav>

      {tab === 'favorites' ? (
        <section className="page paper">
          <h2>OUR FAVORITE MOMENTS ♡</h2>
          {favs.length === 0
            ? <p className="hand">Belum ada favorit. Tekan ♡ di foto mana pun untuk menyimpannya di sini.</p>
            : <div className="grid">{favs.map((p, i) => card(p, favs, i))}</div>}
        </section>
      ) : (
        <>
          {edit && (adding
            ? <AddForm onCreate={createMemory} onCancel={() => setAdding(false)} />
            : <button className="btn primary" onClick={() => setAdding(true)}>+ Add Memory</button>)}

          {memories.length === 0 && <p className="hand center-text">Belum ada memori. Tekan EDIT ALBUM lalu Add Memory ♡</p>}

          {memories.map(m => {
            const mp = photos.filter(p => p.memory_id === m.id)
            const when = m.date ? new Date(m.date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
            return (
              <section className="page paper" key={m.id}>
                <h2>{m.title}</h2>
                <p className="meta hand">{[when, m.location].filter(Boolean).join(' · ')}</p>
                {m.description && <p className="desc">{m.description}</p>}
                <div className="grid">{mp.map((p, i) => card(p, mp, i))}</div>
                {ups.filter(u => u.memoryId === m.id).map(u => (
                  <p className="small" key={u.key}>
                    {u.file.name}: {u.status === 'uploading' ? 'Mengunggah…' : u.error}{' '}
                    {u.status === 'failed' && <>
                      <button onClick={() => runUp(u, mp.length).then(refresh)}>Coba lagi</button>
                      <button onClick={() => setUps(x => x.filter(y => y.key !== u.key))}>Buang</button>
                    </>}
                  </p>
                ))}
                {edit && (
                  <div className="row">
                    <label className="btn">+ Foto
                      <input type="file" hidden multiple accept="image/jpeg,image/png,image/webp"
                        onChange={e => { const f = Array.from(e.target.files || []); e.target.value = ''; if (f.length) addPhotos(m.id, f) }} />
                    </label>
                    <button className="btn" onClick={() => editMemory(m)}>Ubah judul</button>
                    <button className="btn danger" onClick={() => delMemory(m)}>Hapus memori</button>
                  </div>
                )}
              </section>
            )
          })}
        </>
      )}

      {view && cur && (
        <div className="viewer" onClick={() => setView(null)}>
          <button className="x" aria-label="Tutup">×</button>
          <img src={urls[cur.storage_path]} alt={cur.caption} onClick={e => e.stopPropagation()} />
          <p className="hand" onClick={e => e.stopPropagation()}>{cur.caption} <small>({mTitle(cur.memory_id)})</small></p>
          <div className="vbar" onClick={e => e.stopPropagation()}>
            <button disabled={view.i === 0} onClick={() => setView({ ...view, i: view.i - 1 })}>‹</button>
            <span>{view.i + 1} / {view.ids.length}</span>
            <button className={cur.favorite ? 'heart on' : 'heart'} onClick={() => toggleFav(cur)}>{cur.favorite ? '♥' : '♡'}</button>
            <button disabled={view.i === view.ids.length - 1} onClick={() => setView({ ...view, i: view.i + 1 })}>›</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  if (!configured) return <p className="center">Kunci Supabase belum diisi (lihat README, bagian Environment Variables).</p>
  if (session === undefined) return <p className="center">Loading…</p>
  return session ? <AlbumView key={session.user.id} session={session} /> : <Cover />
}
