import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Settings,
  Trash2,
  Activity,
  Database,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  HardDrive
} from 'lucide-react';

interface MediaItem {
  id: string | number;
  origin: string;
  title: string;
  year: number;
  path: string;
  status: string;
  torrent_state: string;
  torrent_hashes: string[];
  ratio: string;
  seed_time: string;
  watched: boolean;
  deletable: boolean;
  criteria: {
    disk: boolean;
    watched: boolean;
    time: boolean;
    ratio: boolean;
  };
  torrents: any[];
}

function App() {
  const [view, setView] = useState<'dashboard' | 'settings'>('dashboard');
  const [loading, setLoading] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [stats, setStats] = useState({ total: 0, eligible: 0 });
  const [disk, setDisk] = useState<any>(null);
  const [services, setServices] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [config, setConfig] = useState<any>({
    RADARR_HOST: '', RADARR_API_KEY: '',
    SONARR_HOST: '', SONARR_API_KEY: '',
    QBIT_HOST: '', QBIT_USERNAME: '', QBIT_PASSWORD: '',
    JELLYFIN_HOST: '', JELLYFIN_API_KEY: '',
    DISK_THRESHOLD: 90, MIN_SEED_WEEKS: 4, MIN_RATIO: 1.0
  });

  useEffect(() => {
    fetchData();
    fetchConfig();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/scan');
      setMedia(res.data.media);
      setStats(res.data.stats);
      setDisk(res.data.disk_usage);
      setServices(res.data.services);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await axios.get('/api/config');
      setConfig(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/config', config);
      alert('Settings Saved!');
      setView('dashboard');
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (item: MediaItem, type: 'media' | 'torrent') => {
    const confirmMsg = type === 'media'
      ? `DELETE ${item.title} and all associated files?`
      : `Remove only torrents for ${item.title}?`;

    if (window.confirm(confirmMsg)) {
      try {
        await axios.post('/api/delete', {
          origin: item.origin,
          id: item.id,
          torrent_hashes: item.torrent_hashes.join(','),
          delete_type: type
        });
        fetchData();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const toggleRow = (id: string) => {
    const newSet = new Set(expandedRows);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedRows(newSet);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <header className="nes-container with-title is-dark" style={{ marginBottom: '2rem' }}>
        <p className="title">Media Cleanerr v1.0</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '20px' }}>
            <button
              onClick={() => setView('dashboard')}
              className={`nes-btn ${view === 'dashboard' ? 'is-primary' : ''}`}>
              DASHBOARD
            </button>
            <button
              onClick={() => setView('settings')}
              className={`nes-btn ${view === 'settings' ? 'is-warning' : ''}`}>
              SETTINGS
            </button>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {Object.entries(services).map(([name, status]) => (
              <span key={name} className={`nes-badge`}>
                <span className={status ? 'is-success' : 'is-error'}>{name}</span>
              </span>
            ))}
          </div>
        </div>
      </header>

      {view === 'dashboard' ? (
        <>
          {/* Stats Bar */}
          <div className="nes-container is-dark" style={{ marginBottom: '2rem', display: 'flex', gap: '2rem', justifyContent: 'space-around' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '0.8rem', color: '#888' }}>DISK USAGE</p>
              <h2 style={{ color: (disk?.percent > (config.DISK_THRESHOLD || 90)) ? '#ff0044' : '#00ff44' }}>
                {disk ? `${disk.percent}%` : '??%'}
              </h2>
              <progress className={`nes-progress ${(disk?.percent > (config.DISK_THRESHOLD || 90)) ? 'is-error' : 'is-success'}`} value={disk?.percent || 0} max="100"></progress>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '0.8rem', color: '#888' }}>TOTAL ITEMS</p>
              <h2>{stats.total}</h2>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '0.8rem', color: '#888' }}>DELETABLE</p>
              <h2 style={{ color: '#f7d51d' }}>{stats.eligible}</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button onClick={fetchData} className={`nes-btn is-success ${loading ? 'is-disabled' : ''}`}>
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> SCAN
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="nes-table-responsive">
            <table className="nes-table is-bordered is-dark" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>TITLE</th>
                  <th>ORIGIN</th>
                  <th>RATIO</th>
                  <th>SEED TIME</th>
                  <th>WATCHED</th>
                  <th>READY?</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {media.length === 0 && !loading && (
                  <tr><td colSpan={7} style={{ textAlign: 'center' }}>NO ITEMS LOADED. START A SCAN.</td></tr>
                )}
                {media.map((item) => (
                  <React.Fragment key={`${item.origin}-${item.id}`}>
                    <tr>
                      <td onClick={() => toggleRow(`${item.origin}-${item.id}`)} style={{ cursor: 'pointer' }}>
                        {item.torrents.length > 0 && (expandedRows.has(`${item.origin}-${item.id}`) ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                        {' '}{item.title} ({item.year})
                      </td>
                      <td>
                        <span className={`nes-text ${item.origin === 'Radarr' ? 'is-primary' : 'is-info'}`}>{item.origin}</span>
                      </td>
                      <td>{item.ratio}</td>
                      <td>{item.seed_time}</td>
                      <td style={{ textAlign: 'center' }}>
                        {item.watched ? <span className="nes-text is-success">YES</span> : <span className="nes-text is-error">NO</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {item.deletable ? (
                          <i className="nes-icon coin is-small"></i>
                        ) : (
                          <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                            <div style={{ width: '8px', height: '8px', background: item.criteria.disk ? '#00ff44' : '#555' }} title="Disk"></div>
                            <div style={{ width: '8px', height: '8px', background: item.criteria.watched ? '#00ff44' : '#555' }} title="Watched"></div>
                            <div style={{ width: '8px', height: '8px', background: item.criteria.time ? '#00ff44' : '#555' }} title="Time"></div>
                            <div style={{ width: '8px', height: '8px', background: item.criteria.ratio ? '#00ff44' : '#555' }} title="Ratio"></div>
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          onClick={() => handleDelete(item, 'media')}
                          className={`nes-btn is-error is-small ${!item.deletable ? 'is-disabled' : ''}`}>
                          DEL
                        </button>
                      </td>
                    </tr>
                    {expandedRows.has(`${item.origin}-${item.id}`) && item.torrents.map((t: any) => (
                      <tr key={t.hash} style={{ backgroundColor: '#1a1d21', fontSize: '0.7rem' }}>
                        <td colSpan={2} style={{ paddingLeft: '40px' }}>└─ {t.label || t.name}</td>
                        <td>{t.ratio}</td>
                        <td>{t.seed_time}</td>
                        <td></td>
                        <td><span style={{ fontSize: '0.6rem' }}>{t.state}</span></td>
                        <td>
                          <button
                            onClick={() => handleDelete(item, 'torrent')}
                            className="nes-btn is-warning is-small"
                            style={{ fontSize: '0.6rem' }}>
                            T-ONLY
                          </button>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        /* Settings View */
        <div className="nes-container is-dark with-title">
          <p className="title">SYSTEM CONFIG</p>
          <form onSubmit={handleSaveConfig}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <section>
                <h3 className="nes-text is-primary">RADARR</h3>
                <div className="nes-field">
                  <label>HOST</label>
                  <input type="text" className="nes-input is-dark" value={config.RADARR_HOST} onChange={e => setConfig({...config, RADARR_HOST: e.target.value})} />
                </div>
                <div className="nes-field">
                  <label>API KEY</label>
                  <input type="password" className="nes-input is-dark" value={config.RADARR_API_KEY} onChange={e => setConfig({...config, RADARR_API_KEY: e.target.value})} />
                </div>
              </section>

              <section>
                <h3 className="nes-text is-info">SONARR</h3>
                <div className="nes-field">
                  <label>HOST</label>
                  <input type="text" className="nes-input is-dark" value={config.SONARR_HOST} onChange={e => setConfig({...config, SONARR_HOST: e.target.value})} />
                </div>
                <div className="nes-field">
                  <label>API KEY</label>
                  <input type="password" className="nes-input is-dark" value={config.SONARR_API_KEY} onChange={e => setConfig({...config, SONARR_API_KEY: e.target.value})} />
                </div>
              </section>

              <section>
                <h3 className="nes-text is-success">QBITTORRENT</h3>
                <div className="nes-field">
                  <label>HOST</label>
                  <input type="text" className="nes-input is-dark" value={config.QBIT_HOST} onChange={e => setConfig({...config, QBIT_HOST: e.target.value})} />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div className="nes-field">
                    <label>USER</label>
                    <input type="text" className="nes-input is-dark" value={config.QBIT_USERNAME} onChange={e => setConfig({...config, QBIT_USERNAME: e.target.value})} />
                  </div>
                  <div className="nes-field">
                    <label>PASS</label>
                    <input type="password" className="nes-input is-dark" value={config.QBIT_PASSWORD} onChange={e => setConfig({...config, QBIT_PASSWORD: e.target.value})} />
                  </div>
                </div>
              </section>

              <section>
                <h3 className="nes-text is-warning">JELLYFIN</h3>
                <div className="nes-field">
                  <label>HOST</label>
                  <input type="text" className="nes-input is-dark" value={config.JELLYFIN_HOST} onChange={e => setConfig({...config, JELLYFIN_HOST: e.target.value})} />
                </div>
                <div className="nes-field">
                  <label>API KEY</label>
                  <input type="password" className="nes-input is-dark" value={config.JELLYFIN_API_KEY} onChange={e => setConfig({...config, JELLYFIN_API_KEY: e.target.value})} />
                </div>
              </section>

              <section style={{ gridColumn: 'span 2' }}>
                <h3 className="nes-text">RULES</h3>
                <div style={{ display: 'flex', gap: '20px' }}>
                  <div className="nes-field">
                    <label>DISK THRESHOLD (%)</label>
                    <input type="number" className="nes-input is-dark" value={config.DISK_THRESHOLD} onChange={e => setConfig({...config, DISK_THRESHOLD: parseInt(e.target.value)})} />
                  </div>
                  <div className="nes-field">
                    <label>MIN SEED WEEKS</label>
                    <input type="number" className="nes-input is-dark" value={config.MIN_SEED_WEEKS} onChange={e => setConfig({...config, MIN_SEED_WEEKS: parseInt(e.target.value)})} />
                  </div>
                  <div className="nes-field">
                    <label>MIN RATIO</label>
                    <input type="number" step="0.1" className="nes-input is-dark" value={config.MIN_RATIO} onChange={e => setConfig({...config, MIN_RATIO: parseFloat(e.target.value)})} />
                  </div>
                </div>
              </section>
            </div>

            <div style={{ marginTop: '2rem', textAlign: 'right' }}>
              <button type="button" onClick={() => setView('dashboard')} className="nes-btn" style={{ marginRight: '1rem' }}>CANCEL</button>
              <button type="submit" className="nes-btn is-primary">SAVE CONFIG</button>
            </div>
          </form>
        </div>
      )}

      <footer style={{ marginTop: '4rem', textAlign: 'center', color: '#555', fontSize: '0.6rem' }}>
        <p>MADE WITH &lt;3 FOR SELF-HOSTER WARRIORS</p>
      </footer>
    </div>
  );
}

export default App;
