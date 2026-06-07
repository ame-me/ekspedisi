import React, { useState, useEffect } from 'react';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [shipments, setShipments] = useState([]);
  const [serverKey, setServerKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [decryptedData, setDecryptedData] = useState({});
  const [currentView, setCurrentView] = useState('dashboard');
  const [dbConnected, setDbConnected] = useState(false);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [searchTerm, setSearchTerm] = useState('');
  
  const [securityLogs, setSecurityLogs] = useState([
    { id: 1, time: '10:00 AM', msg: 'System initialized with IP Master Key.', type: 'info' },
    { id: 2, time: '10:05 AM', msg: 'ChaCha20 ARX Rounds validated.', type: 'success' }
  ]);
  
  const [formData, setFormData] = useState({
    senderName: '', senderPhone: '', senderKec: '', senderAddr: '',
    receiverName: '', receiverPhone: '', receiverKec: '', receiverAddr: '',
    itemName: '', itemCategory: 'Pakaian', itemDesc: '', 
    service: 'Reguler', insuranceValue: 0, weight: 1, itemValue: 0
  });

  const API_URL = 'http://127.0.0.1:5000/api';

  useEffect(() => {
    if (isLoggedIn) {
      fetchShipments();
      fetchKey();
    }
  }, [isLoggedIn]);

  const fetchKey = async () => {
    try {
      const response = await fetch(`${API_URL}/key`);
      if (!response.ok) throw new Error('Failed to fetch key');
      const data = await response.json();
      setServerKey(data.key);
      setDbConnected(true);
      addLog('Master Key synchronized with server.', 'success');
    } catch (err) { 
      console.error(err);
      setDbConnected(false);
      addLog('Failed to sync Master Key. Check server!', 'warning');
    }
  }

  const fetchShipments = async () => {
    try {
      const response = await fetch(`${API_URL}/shipments`);
      const data = await response.json();
      setShipments(data);
    } catch (err) { console.error(err); }
  };

  const addLog = (msg, type = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setSecurityLogs(prev => [{ id: Date.now(), time, msg, type }, ...prev].slice(0, 5));
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (loginData.username === 'admin' && loginData.password === 'admin') {
      setIsLoggedIn(true);
      addLog('Admin authenticated via secure gateway.', 'success');
    } else {
      alert("Akses Ditolak!");
      addLog('Unauthorized login attempt.', 'warning');
    }
  };


  const updateStatus = async (id, newStatus) => {
    try {
      const response = await fetch(`${API_URL}/shipments/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await response.json();
      if (response.ok && data.message === 'Success') {
        await fetchShipments();
        addLog(`Status: ${newStatus}`, 'success');
      }
    } catch (err) { console.error(err); }
  };

  const handleCycleStatus = (id, currentStatus) => {
    const nextStatus = currentStatus === 'Pending' ? 'In Transit' : 
                     currentStatus === 'In Transit' ? 'Delivered' : 
                     currentStatus === 'Ready to Ship' ? 'In Transit' : 'Pending';
    updateStatus(id, nextStatus);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fullDescription = `${formData.item_type} (${formData.weight}kg) - ${formData.service}. Notes: ${formData.notes}`;
      const response = await fetch(`${API_URL}/shipments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (response.ok) {
        setFormData({ 
          senderName: '', senderPhone: '', senderKec: '', senderAddr: '',
          receiverName: '', receiverPhone: '', receiverKec: '', receiverAddr: '',
          itemName: '', itemCategory: 'Pakaian', itemDesc: '', 
          service: 'Reguler', insuranceValue: 0, weight: 1, itemValue: 0
        });
        fetchShipments();
        addLog(`New shipment secured and saved.`, 'success');
        alert("Data berhasil disimpan secara terenkripsi!");
        setCurrentView('dashboard');
      } else {
        const errorData = await response.json();
        alert(`Gagal menyimpan: ${errorData.error || 'Server error'}`);
        addLog(`Failed to save shipment: ${errorData.error}`, 'warning');
      }
    } catch (err) { 
      console.error(err); 
      alert("Gagal menghubungi server. Pastikan server backend sudah jalan (node server.cjs)");
      addLog(`Connection error: ${err.message}`, 'warning');
    }
    finally { setLoading(false); }
  };

  const handleDecrypt = async (id, itemsToDecrypt, nonce) => {
    try {
      addLog(`Decrypting dataset ${id}...`, 'info');
      const decryptedResults = {};
      
      for (const [key, encryptedData] of Object.entries(itemsToDecrypt)) {
        const res = await fetch(`${API_URL}/decrypt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ encryptedData, nonceBase64: nonce })
        });
        const data = await res.json();
        decryptedResults[`${key}_${id}`] = data.decrypted;
      }

      setDecryptedData(prev => ({ ...prev, ...decryptedResults }));
      addLog(`ChaCha20 Decryption completed for ${id}.`, 'success');
    } catch (err) { console.error(err); }
  };

  const handleDecryptAll = async () => {
    if (shipments.length === 0) return;
    addLog('Master audit decryption started...', 'warning');
    for (const item of shipments) {
      await handleDecrypt(item.id, {
        sender: item.sender_name_enc,
        sender_phone: item.sender_phone_enc,
        sender_kec: item.sender_kec_enc,
        sender_addr: item.sender_addr_enc,
        receiver: item.receiver_name_enc,
        receiver_phone: item.receiver_phone_enc,
        receiver_kec: item.receiver_kec_enc,
        receiver_addr: item.receiver_addr_enc,
        item_name: item.item_name_enc,
        item_cat: item.item_category_enc,
        desc: item.item_desc_enc,
        insurance: item.insurance_enc
      }, item.nonce);
    }
  };

  const handleLock = (id) => {
    const newDecrypted = { ...decryptedData };
    // Bersihkan semua data terkait ID ini
    Object.keys(newDecrypted).forEach(key => {
      if (key.endsWith(`_${id}`)) {
        delete newDecrypted[key];
      }
    });
    setDecryptedData(newDecrypted);
    addLog(`Record ${id} re-locked for security.`, 'info');
  };

  const parseItemData = (item) => {
    const service = item.service_type || 'Reguler';
    const weight = item.weight || 1;
    const baseRate = 10000;
    const multiplier = service === 'Ekspres' ? 1.5 : service === 'Same Day' ? 2 : 1;
    const cost = (weight * baseRate * multiplier) + 5000;
    return { service, weight, type: 'Paket', cost };
  };

  const printReceipt = async (item) => {
    let sender = decryptedData[`sender_${item.id}`];
    let receiver = decryptedData[`receiver_${item.id}`];
    let addr = decryptedData[`receiver_addr_${item.id}`];
    let kec = decryptedData[`receiver_kec_${item.id}`];
    let phone = decryptedData[`receiver_phone_${item.id}`];
    
    if (!sender || !receiver || !addr) {
      addLog(`Akses Ditolak: Data masih terenkripsi.`, 'warning');
      return alert("Akses Ditolak! Mohon dekripsi data terlebih dahulu sebelum mencetak resi.");
    }
    
    updateStatus(item.id, 'Ready to Ship');
    const { service } = parseItemData(item);
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
        body { font-family: 'Outfit', sans-serif; padding: 15px; color: #000; width: 400px; margin: 0 auto; }
        .label-container { border: 3px solid #000; border-radius: 4px; overflow: hidden; }
        .receipt-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding: 10px; background: #000; color: #fff; }
        .brand { font-size: 24px; font-weight: 900; }
        .service-badge { background: #fff; color: #000; padding: 5px 15px; font-weight: 900; font-size: 16px; border-radius: 2px; }
        .barcode-section { padding: 15px; text-align: center; border-bottom: 2px solid #000; background: #fff; }
        .barcode-visual { height: 60px; background: repeating-linear-gradient(90deg, #000, #000 2px, #fff 2px, #fff 6px); width: 80%; margin: 0 auto; }
        .tracking-text { font-size: 28px; font-weight: 900; letter-spacing: 4px; margin-top: 10px; }
        .receiver-main { padding: 15px; background: #fff; border-bottom: 2px solid #000; }
        .receiver-name { font-size: 24px; font-weight: 900; margin-bottom: 5px; }
        .address-box { padding: 12px; border-bottom: 2px solid #000; }
        .label-small { font-size: 10px; font-weight: 800; text-transform: uppercase; margin-bottom: 5px; opacity: 0.7; }
        .address-val { font-size: 14px; font-weight: 700; line-height: 1.2; }
        .security-footer { font-size: 8px; text-align: center; padding: 5px; background: #f4f4f4; border-top: 1px solid #000; font-weight: 700; }
      </style></head>
      <body>
        <div class="label-container">
          <div class="receipt-header"><div class="brand">EKSPRESIN AJA</div><div class="service-badge">${service.toUpperCase()}</div></div>
          <div class="barcode-section"><div class="barcode-visual"></div><div class="tracking-text">${item.tracking_number}</div></div>
          <div class="address-box"><div class="label-small">PENGIRIM (SENDER)</div><div class="address-val">${sender}</div></div>
          <div class="receiver-main">
            <div class="label-small" style="color:red;">PENERIMA (RECEIVER)</div><div class="receiver-name">${receiver}</div>
            <div class="address-val" style="font-size:18px; margin-bottom:8px;">${phone}</div><div class="address-val">${kec}, ${addr}</div>
          </div>
          ${item.item_notes ? `
          <div class="address-box" style="background:#fff7ed; border-top: 1px dashed #000;">
            <div class="label-small" style="color:#c2410c;">INSTRUKSI KURIR / NOTES</div>
            <div class="address-val" style="font-size:16px; font-weight:900; text-transform:uppercase;">${item.item_notes}</div>
          </div>` : ''}
          <div class="security-footer">SECURED BY CHACHA20 // DATA PROTECTED</div>
        </div>
      </body></html>
    `);
    win.document.close(); win.print();
  };
  
  const printFullReport = () => {
    const win = window.open('', '_blank');
    const totalRev = calculateTotalRevenue();
    win.document.write(`
      <html><head><style>
        body { font-family: 'Outfit', sans-serif; padding: 40px; }
        h1 { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background: #f4f4f4; }
        .footer { margin-top: 30px; text-align: right; font-weight: bold; }
      </style></head>
      <body>
        <h1>LAPORAN MANIFEST EKSPRESIN AJA</h1>
        <p>Tanggal Cetak: ${new Date().toLocaleString()}</p>
        <table>
          <thead><tr><th>Resi</th><th>Layanan</th><th>Berat</th><th>Biaya</th><th>Status</th></tr></thead>
          <tbody>
            ${shipments.map(s => `
              <tr>
                <td>${s.tracking_number}</td>
                <td>${s.service_type}</td>
                <td>${s.weight} kg</td>
                <td>Rp ${parseItemData(s).cost.toLocaleString()}</td>
                <td>${s.status}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="footer">Total Revenue: Rp ${totalRev.toLocaleString()}</div>
      </body></html>
    `);
    win.document.close(); win.print();
  };

  const calculateTotalRevenue = () => {
    return shipments.reduce((total, item) => total + parseItemData(item).cost, 0);
  };

  const filteredShipments = shipments.filter(s => 
    s.tracking_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isLoggedIn) {
    return (
      <div className="login-screen">
        <div className="login-card fade-in">
          <div className="logo" style={{ marginBottom: '0.5rem', textAlign: 'center', width: '100%' }}>Ekspresin Aja</div>
          <p style={{ textAlign: 'center', color: 'var(--text-dim)', marginBottom: '2.5rem', fontWeight: 600 }}>Administrator Authorization</p>
          <form onSubmit={handleLogin}>
            <div className="form-group"><label>Administrator ID</label><input type="text" placeholder="admin" onChange={e => setLoginData({...loginData, username: e.target.value})} /></div>
            <div className="form-group"><label>Password</label><input type="password" placeholder="••••••••" onChange={e => setLoginData({...loginData, password: e.target.value})} /></div>
            <button type="submit" className="btn-primary" style={{width: '100%', marginTop: '1rem'}}>Authorize & Open Gateway</button>
          </form>
          <p style={{marginTop: '2rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-dim)'}}>Sistem Informasi Ekspedisi Aman Terintegrasi</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <nav className="sidebar">
        <div className="logo" style={{ padding: '2.5rem 2rem' }}>Ekspresin Aja</div>
        <div className="nav-items">
          <div className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentView('dashboard')}>Dashboard</div>
          <div className={`nav-item ${currentView === 'registration' ? 'active' : ''}`} onClick={() => setCurrentView('registration')}>Input Pengiriman</div>
          <div className={`nav-item ${currentView === 'manifest' ? 'active' : ''}`} onClick={() => setCurrentView('manifest')}>Monitoring Paket</div>
          <div className={`nav-item ${currentView === 'reports' ? 'active' : ''}`} onClick={() => setCurrentView('reports')}>Statistik & Laporan</div>
        </div>
        <div className="logout-btn" onClick={() => setIsLoggedIn(false)}>Sign Out</div>
      </nav>

      <main className="content">
        <div className="header-dashboard fade-in">
          <div>
            <h1>{currentView === 'dashboard' ? 'Dashboard' : currentView === 'registration' ? 'Input Pengiriman Baru' : currentView === 'manifest' ? 'Monitoring Manifest' : 'Statistik & Laporan'}</h1>
            <p style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Operasional Ekspedisi Terenkripsi</p>
          </div>
          <div className="user-profile"><div className="status-dot"></div><span>Gateway: {serverKey}</span></div>
        </div>

        {currentView === 'dashboard' && (
          <div className="fade-in">
            {!dbConnected && (
              <div className="card" style={{background: '#fee2e2', border: '1px solid #ef4444', marginBottom: '2rem', color: '#b91c1c'}}>
                <strong>⚠️ Server Offline:</strong> Data tidak dapat dimuat atau disimpan. Pastikan Anda menjalankan <code>npm run server</code> di terminal baru.
              </div>
            )}

            <div className="stats-grid">
              <div className="stat-card" style={{borderLeft:'5px solid var(--primary)'}}><span className="stat-label">Total Shipments</span><div className="stat-value" style={{color:'var(--primary)'}}>{shipments.length}</div><div className="stat-trend" style={{color: dbConnected ? 'var(--success)' : 'var(--danger)'}}>{dbConnected ? 'DB Status: Connected' : 'DB Status: Disconnected'}</div></div>
              <div className="stat-card" style={{borderLeft:'5px solid var(--success)'}}><span className="stat-label">Ready to Ship</span><div className="stat-value">{shipments.filter(s => s.status === 'Ready to Ship').length}</div><div className="stat-trend">Label Terbit</div></div>
              <div className="stat-card" style={{borderLeft:'5px solid #6366f1'}}><span className="stat-label">Total Revenue</span><div className="stat-value" style={{fontSize:'1.5rem'}}>Rp {calculateTotalRevenue().toLocaleString()}</div><div className="stat-trend" style={{color:'var(--success)'}}>Live Income</div></div>
            </div>

            <div className="main-grid" style={{gridTemplateColumns: '1.2fr 0.8fr', gap: '2rem'}}>
              <div className="card">
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem'}}>
                  <h3>Recent Shipments</h3>
                  <button className="btn-primary" style={{padding:'5px 15px', fontSize:'11px'}} onClick={() => setCurrentView('manifest')}>View All</button>
                </div>
                <div className="table-responsive">
                   <table className="custom-table" style={{fontSize:'0.85rem'}}>
                     <thead><tr><th>Resi</th><th>Penerima</th><th>Layanan</th><th>Status</th></tr></thead>
                     <tbody>
                       {shipments.slice(0, 6).map(s => {
                         const { service } = parseItemData(s);
                         return (
                           <tr key={s.id}>
                             <td style={{fontWeight:'bold', padding:'1rem 5px'}}>{s.tracking_number}</td>
                             <td>{decryptedData[`receiver_${s.id}`] || '••••••••'}</td>
                             <td><span className={`service-badge ${service === 'Ekspres' ? 'ekspres' : ''}`}>{service}</span></td>
                             <td>
                               <span 
                                 className={`status-badge status-${s.status.toLowerCase().replace(/ /g, '')}`}
                                 style={{fontSize:'9px', padding: '4px 8px', whiteSpace: 'nowrap'}}
                               >
                                 {s.status}
                               </span>
                             </td>
                           </tr>
                         );
                       })}
                     </tbody>
                   </table>
                </div>
              </div>

              <div className="card" style={{display: 'flex', flexDirection: 'column'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem'}}>
                  <h3>Security Health Pulse</h3>
                  <div className="pulse-container">
                    <div className="pulse-dot"></div>
                    <span style={{fontSize:'9px', fontWeight:'900', color:'var(--success)'}}>LIVE PROTECTION</span>
                  </div>
                </div>
                
                <div className="security-metrics" style={{flex: 1}}>
                  <div className="metric-row">
                    <span className="metric-label">Algorithm</span>
                    <span className="badge-tech">ChaCha20 (256-bit)</span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-label">ARX Design</span>
                    <span className="badge-tech">Add-Rotate-Xor</span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-label">Master Key</span>
                    <span className="badge-tech" style={{maxWidth:'100px', overflow:'hidden', textOverflow:'ellipsis'}}>{serverKey}</span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-label">Data Integrity</span>
                    <span style={{color:'var(--success)', fontWeight:'900', fontSize: '0.8rem'}}>Verified ✅</span>
                  </div>

                  <div style={{marginTop:'1.5rem', padding:'1rem', background:'#f0f9ff', borderRadius:'10px', border:'1px dashed #bae6fd'}}>
                    <div style={{fontSize:'0.7rem', color:'#0369a1', lineHeight:'1.5'}}>
                      <strong>Security Note:</strong> Data PII (Personal Identifiable Information) dienkripsi di level database menggunakan Stream Cipher untuk performa tinggi.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentView === 'registration' && (
          <div className="fade-in card" style={{maxWidth: '1000px', padding: '0', background: '#f8fafc'}}>
            <div style={{padding: '2rem', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <h2 style={{margin: 0}}>Tambah Paket Baru</h2>
              <div className="service-badge ekspres">{formData.service}</div>
            </div>

            <form onSubmit={handleSubmit} style={{padding: '2rem'}}>
              {/* SECTION PENGIRIM */}
              <div className="form-section-card">
                <div className="section-header">PENGIRIM</div>
                <div className="form-row">
                  <div className="form-group"><label>Nama Pengirim</label><input type="text" value={formData.senderName} onChange={e => setFormData({...formData, senderName: e.target.value})} placeholder="Nama Lengkap" required /></div>
                  <div className="form-group"><label>No. Telp/HP</label><input type="text" value={formData.senderPhone} onChange={e => setFormData({...formData, senderPhone: e.target.value})} placeholder="08xxxxxxxxxx" required /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Kecamatan/Kabupaten</label><input type="text" value={formData.senderKec} onChange={e => setFormData({...formData, senderKec: e.target.value})} placeholder="Cth: Depok, Sleman" required /></div>
                </div>
                <div className="form-group"><label>Detail Alamat</label><textarea rows="2" value={formData.senderAddr} onChange={e => setFormData({...formData, senderAddr: e.target.value})} placeholder="Nama jalan, nomor rumah, RT/RW" required></textarea></div>
              </div>

              {/* SECTION PENERIMA */}
              <div className="form-section-card" style={{marginTop: '2rem'}}>
                <div className="section-header" style={{color: '#ef4444'}}>PENERIMA</div>
                <div className="form-row">
                  <div className="form-group"><label>Nama Penerima</label><input type="text" value={formData.receiverName} onChange={e => setFormData({...formData, receiverName: e.target.value})} placeholder="Nama Lengkap" required /></div>
                  <div className="form-group"><label>No. Telp/HP</label><input type="text" value={formData.receiverPhone} onChange={e => setFormData({...formData, receiverPhone: e.target.value})} placeholder="08xxxxxxxxxx" required /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Kecamatan/Kabupaten</label><input type="text" value={formData.receiverKec} onChange={e => setFormData({...formData, receiverKec: e.target.value})} placeholder="Cth: Lowokwaru, Malang" required /></div>
                </div>
                <div className="form-group"><label>Detail Alamat</label><textarea rows="2" value={formData.receiverAddr} onChange={e => setFormData({...formData, receiverAddr: e.target.value})} placeholder="Nama jalan, nomor rumah, RT/RW" required></textarea></div>
              </div>

              {/* SECTION INFORMASI BARANG */}
              <div className="form-section-card" style={{marginTop: '2rem'}}>
                <div className="section-header" style={{color: 'var(--primary)'}}>INFORMASI BARANG</div>
                <div className="form-row">
                  <div className="form-group"><label>Nama Barang</label><input type="text" value={formData.itemName} onChange={e => setFormData({...formData, itemName: e.target.value})} placeholder="Cth: Laptop" required /></div>
                  <div className="form-group"><label>Jenis Barang</label>
                    <select value={formData.itemCategory} onChange={e => setFormData({...formData, itemCategory: e.target.value})} className="modern-select">
                      <option>Pakaian</option><option>Elektronik</option><option>Makanan</option><option>Dokumen</option><option>Lainnya</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Layanan</label>
                    <select value={formData.service} onChange={e => setFormData({...formData, service: e.target.value})} className="modern-select">
                      <option>Reguler</option><option>Ekspres</option><option>Same Day</option>
                    </select>
                  </div>
                  <div className="form-group"><label>Berat (Kg)</label>
                    <input type="number" min="1" value={formData.weight} onChange={e => setFormData({...formData, weight: parseFloat(e.target.value)})} required />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Estimasi Harga Barang (Rp) - <i>Di-enkripsi</i></label>
                    <input type="number" value={formData.itemValue} onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      const ins = val * 0.002; // 0.2%
                      setFormData({...formData, itemValue: val, insuranceValue: ins});
                    }} required />
                  </div>
                  <div className="form-group"><label>Premi Asuransi (0.2%)</label>
                    <input type="text" value={`Rp ${formData.insuranceValue.toLocaleString()}`} readOnly className="cost-input" />
                  </div>
                </div>
                <div className="form-group"><label>Keterangan Instruksi Kurir</label><textarea rows="2" value={formData.itemDesc} onChange={e => setFormData({...formData, itemDesc: e.target.value})} placeholder="Cth: Barang pecah belah, jangan dibanting"></textarea></div>
              </div>

              <div style={{marginTop: '2.5rem', display: 'flex', gap: '1rem'}}>
                <button type="submit" className="btn-primary" disabled={loading} style={{flex: 2, padding: '1.2rem'}}>
                  {loading ? '🔐 MENGAMANKAN DATA...' : 'KONFIRMASI & KIRIM PAKET'}
                </button>
                <div style={{flex: 1, background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1rem', textAlign: 'center'}}>
                  <div style={{fontSize: '0.7rem', color: '#64748b'}}>TOTAL BIAYA</div>
                  <div style={{fontSize: '1.2rem', fontWeight: '900', color: 'var(--primary)'}}>
                    Rp {( (formData.weight * 10000 * (formData.service === 'Ekspres' ? 1.5 : formData.service === 'Same Day' ? 2 : 1)) + 5000 + formData.insuranceValue ).toLocaleString()}
                  </div>
                </div>
              </div>
            </form>
            
            <style>{`
              .form-section-card { background: #fff; padding: 1.5rem; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
              .section-header { font-size: 0.75rem; font-weight: 900; letter-spacing: 1px; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 10px; }
              .section-header::after { content: ''; flex: 1; height: 1px; background: #f1f5f9; }
            `}</style>
          </div>
        )}

        {currentView === 'manifest' && (
          <div className="fade-in">
            <div className="search-bar-container"><input type="text" placeholder="Cari Resi atau Penerima..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="search-input" /></div>
            <div className="card table-card">
              <div className="table-responsive">
                <table className="custom-table">
                  <thead><tr><th>No. Resi</th><th>Penerima</th><th>Layanan</th><th>Status</th><th>Data Terenkripsi</th><th>Aksi</th></tr></thead>
                  <tbody>
                    {filteredShipments.map(item => {
                      const { service } = parseItemData(item);
                      return (
                        <tr key={item.id}>
                          <td className="tracking-id">{item.tracking_number}</td>
                          <td style={{fontWeight: 700}}>{decryptedData[`receiver_${item.id}`] || '••••••••'}</td>
                          <td><span className={`service-badge ${service === 'Ekspres' ? 'ekspres' : ''}`}>{service}</span></td>
                          <td>
                             <span 
                               className={`status-badge status-${item.status.toLowerCase().replace(/ /g, '')}`} 
                               onClick={() => handleCycleStatus(item.id, item.status)}
                               style={{cursor:'pointer'}}
                             >
                               {item.status}
                             </span>
                          </td>
                          <td>
                            <div style={{display:'flex', gap:'5px', flexWrap: 'wrap'}}>
                              <div className="cipher-box" title="Decrypted Receiver" style={{ background: decryptedData[`receiver_${item.id}`] ? '#ecfdf5' : '', color: decryptedData[`receiver_${item.id}`] ? '#059669' : '' }}>
                                {decryptedData[`receiver_${item.id}`] || (item.receiver_name_enc || '••••').substring(0, 8) + '...'}
                              </div>
                              <div className="cipher-box" title="Decrypted Address" style={{ background: decryptedData[`receiver_addr_${item.id}`] ? '#ecfdf5' : '', color: decryptedData[`receiver_addr_${item.id}`] ? '#059669' : '' }}>
                                {decryptedData[`receiver_addr_${item.id}`] || (item.receiver_addr_enc || '••••').substring(0, 8) + '...'}
                              </div>
                              <div className="cipher-box" title="Notes (Public)" style={{ background: '#fff7ed', color: '#c2410c', borderColor: '#ffedd5' }}>
                                📝 {item.item_notes || 'No Notes'}
                              </div>
                              <div className="cipher-box" title="Insurance/Price" style={{ background: decryptedData[`insurance_${item.id}`] ? '#eff6ff' : '', color: decryptedData[`insurance_${item.id}`] ? '#2563eb' : '' }}>
                                💰 {decryptedData[`insurance_${item.id}`] ? `Rp ${parseInt(decryptedData[`insurance_${item.id}`]).toLocaleString()}` : (item.insurance_enc || '••••').substring(0, 6) + '...'}
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="action-btns">
                              {!decryptedData[`receiver_addr_${item.id}`] ? (
                                <button className="btn-action decrypt" onClick={() => handleDecrypt(item.id, {
                                  sender: item.sender_name_enc,
                                  sender_phone: item.sender_phone_enc,
                                  sender_kec: item.sender_kec_enc,
                                  sender_addr: item.sender_addr_enc,
                                  receiver: item.receiver_name_enc,
                                  receiver_kec: item.receiver_kec_enc,
                                  receiver_addr: item.receiver_addr_enc,
                                  receiver_phone: item.receiver_phone_enc,
                                  insurance: item.insurance_enc
                                }, item.nonce)} title="Dekripsi Data">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path><path d="M12 11v-4"></path></svg>
                                </button>
                              ) : (
                                <button className="btn-action lock" onClick={() => handleLock(item.id)} title="Kunci Kembali">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                </button>
                              )}
                              <button className="btn-action print" onClick={() => printReceipt(item)} title="Cetak Resi">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {currentView === 'reports' && (
          <div className="fade-in">
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'2rem', gap: '10px'}}>
              <h2>Laporan Audit & Statistik</h2>
              <div style={{display:'flex', gap:'10px'}}>
                <button className="btn-primary" onClick={printFullReport} style={{background:'#6366f1'}}>Cetak Laporan (PDF)</button>
                <button className="btn-primary" onClick={handleDecryptAll} style={{background:'#059669'}}>Mulai Audit Dekripsi (Full Access)</button>
              </div>
            </div>
            
            <div className="card" style={{marginBottom:'2rem'}}>
              <h3>Tabel Audit Terperinci</h3>
              <div className="table-responsive" style={{marginTop:'1.5rem'}}>
                <table className="custom-table" style={{fontSize:'0.8rem'}}>
                  <thead>
                    <tr>
                      <th>Resi</th>
                      <th>Pengirim (Audit)</th>
                      <th>Penerima (Audit)</th>
                      <th>Alamat (Audit)</th>
                      <th>Barang (Audit)</th>
                      <th>Asuransi (Audit)</th>
                      <th>Notes (Publik)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shipments.map(s => (
                      <tr key={s.id}>
                        <td style={{fontWeight:'bold'}}>{s.tracking_number}</td>
                        <td>{decryptedData[`sender_${s.id}`] || <span className="locked-data" title={s.sender_name_enc}>LOCKED</span>}</td>
                        <td>{decryptedData[`receiver_${s.id}`] || <span className="locked-data" title={s.receiver_name_enc}>LOCKED</span>}</td>
                        <td>{decryptedData[`receiver_kec_${s.id}`] ? `${decryptedData[`receiver_kec_${s.id}`]}, ${decryptedData[`receiver_addr_${s.id}`]}` : <span className="locked-data" title={s.receiver_addr_enc}>LOCKED</span>}</td>
                        <td>{decryptedData[`item_name_${s.id}`] || <span className="locked-data" title={s.item_name_enc}>LOCKED</span>}</td>
                        <td>{decryptedData[`insurance_${s.id}`] ? `Rp ${parseInt(decryptedData[`insurance_${s.id}`]).toLocaleString()}` : <span className="locked-data" title={s.insurance_enc}>LOCKED</span>}</td>
                        <td style={{color: '#c2410c', fontWeight: 600}}>{s.item_notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="main-grid" style={{gridTemplateColumns: '1.2fr 0.8fr', gap: '2rem'}}>
              <div className="card">
                <h3>Revenue Analysis</h3>
                <div className="table-responsive" style={{marginTop:'1.5rem'}}>
                  <table className="custom-table">
                    <thead><tr><th>Layanan</th><th>Vol</th><th style={{textAlign:'right'}}>Revenue</th></tr></thead>
                    <tbody>
                      {['Reguler', 'Ekspres', 'Same Day'].map(svc => {
                        const filtered = shipments.filter(s => s.service_type === svc);
                        const totalRev = filtered.length * (15000 + (svc === 'Ekspres' ? 10000 : 0));
                        return (
                          <tr key={svc}>
                            <td><span className={`service-badge ${svc !== 'Reguler' ? 'ekspres' : ''}`}>{svc}</span></td>
                            <td>{filtered.length}</td>
                            <td style={{textAlign:'right', fontWeight: '900', color: 'var(--primary)'}}>Rp {totalRev.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              
              <div className="card">
                <h3>Security Audit Log</h3>
                <div className="table-responsive" style={{marginTop:'1.5rem'}}>
                  <table className="custom-table" style={{fontSize:'0.85rem'}}>
                    <thead><tr><th>Waktu</th><th>Event</th></tr></thead>
                    <tbody>
                      {securityLogs.map(log => (
                        <tr key={log.id}>
                          <td>{log.time}</td>
                          <td style={{color: log.type === 'warning' ? 'red' : 'inherit'}}>{log.msg}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <footer style={{marginTop:'3rem', textAlign:'center', fontSize:'0.7rem', color:'var(--text-dim)', paddingBottom:'2rem'}}>
          &copy; 2026 Ekspresin Aja - Logistik Aman & Terpercaya.
        </footer>
      </main>
      
      <style>{`
        .modern-select { width: 100%; padding: 1rem; border-radius: 1rem; border: 1px solid var(--border); background: #f8fafc; font-family: inherit; font-size: 0.85rem; }
        .cost-input { background: #eef2ff !important; color: var(--primary) !important; font-weight: bold; border-color: #c7d2fe !important; }
        .btn-action { width: 38px; height: 38px; border-radius: 12px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
        .btn-action:hover { transform: scale(1.15); filter: brightness(0.95); }
        .service-badge { background: #f1f5f9; color: #475569; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; border: 1px solid #e2e8f0; }
        .service-badge.ekspres { background: #eef2ff; color: #4f46e5; border-color: #c7d2fe; }
        .status-badge { font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 50px; text-transform: uppercase; white-space: nowrap; }
        .status-pending { background: #fff7ed; color: #c2410c; border: 1px solid #ffedd5; }
        .status-readytoship { background: #f5f3ff; color: #7c3aed; border: 1px solid #ddd6fe; }
        .status-intransit { background: #eff6ff; color: #1d4ed8; border: 1px solid #dbeafe; }
        .status-delivered { background: #f0fdf4; color: #15803d; border: 1px solid #dcfce7; }
        .pulse-container { display: flex; align-items: center; gap: 8px; background: #f0fdf4; padding: 5px 12px; border-radius: 50px; border: 1px solid #dcfce7; }
        .pulse-dot { width: 8px; height: 8px; background: var(--success); border-radius: 50%; animation: pulse-anim 1.5s infinite; }
        @keyframes pulse-anim { 0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); } 70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); } 100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); } }
        
        .security-metrics { display: flex; flex-direction: column; gap: 15px; width: 100%; }
        .metric-row { display: flex; justify-content: space-between; align-items: center; width: 100%; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; }
        .metric-label { font-size: 0.8rem; color: var(--text-dim); font-weight: 600; }
        .badge-tech { background: #f1f5f9; color: #334155; padding: 4px 10px; border-radius: 6px; font-family: 'Courier New', monospace; font-size: 0.75rem; border: 1px solid #e2e8f0; }
        
        @media (max-width: 992px) {
          .login-screen > div { 
            grid-template-columns: 1fr !important; 
            max-width: 500px !important; 
            gap: 1.5rem !important;
          }
          .main-grid { grid-template-columns: 1fr !important; }
          .sidebar { width: 80px; }
          .sidebar .logo, .nav-item { font-size: 0; padding: 1.5rem 0; text-align: center; }
          .nav-item::before { content: '•'; font-size: 1.5rem; }
          .content { margin-left: 80px; }
        }
      `}</style>
    </div>
  );
}

export default App;
