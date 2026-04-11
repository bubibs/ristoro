// Utilità Distanza Haversine
function getDistance(lat1, lon1, lat2, lon2) {
  if(!lat1 || !lon1 || !lat2 || !lon2) return null;
  const p = 0.017453292519943295;
  const c = Math.cos;
  const a = 0.5 - c((lat2 - lat1) * p)/2 + 
          c(lat1 * p) * c(lat2 * p) * 
          (1 - c((lon2 - lon1) * p))/2;
  const km = 12742 * Math.asin(Math.sqrt(a)); 
  return km.toFixed(1);
}

// App Logic (Nessun import ES Module, usa variabili globali window.DB per compatibilità locale)
class App {
  constructor() {
    this.currentView = 'home';
    this.currentLocation = null;
    this.customSearchTarget = null;
    this.map = null;
    this.markersLayer = null;
    this.markers = [];
    
    // Config: Tipi di luoghi
    this.placeTypes = {
      work: 'Luoghi di Lavoro',
      hotels: 'Hotel',
      restaurants: 'Ristoranti & Mense'
    };

    this.init();
  }

  async init() {
    this.setupTheme();
    this.setupNav();
    this.checkSyncStatus();
    await this.navigate('home');
  }

  checkSyncStatus() {
    const syncEl = document.getElementById('sync-status');
    if(syncEl) {
        // Verifica variabile esposta da firebase-db.js "isConfigured"
        const isFirebaseOk = (window.DB && window.firebaseConfig && window.firebaseConfig.apiKey !== "YOUR_API_KEY");
        if(isFirebaseOk) {
            syncEl.innerHTML = "🟢 <span style='font-size:0.7rem;'>Cloud</span>";
            syncEl.title = "Sincronizzato online con Firebase";
        } else {
            syncEl.innerHTML = "🏢 <span style='font-size:0.7rem;'>Locale</span>";
            syncEl.title = "Salvataggio sul telefono. Configura Firebase per sincronizzare.";
            syncEl.onclick = () => window.showToast("Modifica firebase-db.js per collegare i dati al Cloud!", true);
        }
    }
  }

  // --- Theme ---
  setupTheme() {
    const toggle = document.getElementById('theme-toggle');
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    let isDark = localStorage.getItem('theme') ? localStorage.getItem('theme') === 'dark' : mediaQuery.matches;
    
    const applyTheme = () => {
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      toggle.innerHTML = isDark ? '☀️' : '🌙';
      
      if (this.map) {
          const mapEl = document.getElementById('main-map');
          if(mapEl) {
               if(isDark) mapEl.style.filter = "invert(90%) hue-rotate(180deg)";
               else mapEl.style.filter = "none";
          }
      }
    };

    // Ascolto cambio Dark Mode Automatico Sistema/iOS
    mediaQuery.addEventListener('change', (e) => {
      // Usiamo quello di sistema solo se l'utente non lo ha forzato manualmente via bottone
      if(!localStorage.getItem('theme')) {
         isDark = e.matches;
         applyTheme();
      }
    });

    toggle.addEventListener('click', () => {
      isDark = !isDark;
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      applyTheme();
    });

    applyTheme();
  }

  // --- Navigation & Routing ---
  setupNav() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.currentTarget.getAttribute('data-view');
        this.navigate(view);
      });
    });
  }

  updateNavState(view) {
    document.querySelectorAll('.nav-item').forEach(btn => {
      if (btn.getAttribute('data-view') === view) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  async navigate(view, subView = null, placeData = null) {
    const content = document.getElementById('app-content');
    content.innerHTML = ''; // Clear current
    
    // Basic Routing
    if (subView === 'add' || subView === 'edit') {
      this.currentView = `${view}-${subView}`;
      await this.renderForm(view, placeData);
    } else if (view === 'home') {
      this.currentView = 'home';
      this.updateNavState('home');
      await this.renderHome();
      
      const searchIn = document.getElementById('home-target-search');
      if (searchIn) {
         searchIn.addEventListener('keydown', (e) => {
             if (e.key === 'Enter') {
                 this.searchCustomTarget(e.target.value);
             }
         });
      }
      if (this.customSearchTarget) {
          const tEl = document.getElementById('home-target-title');
          if(tEl) tEl.innerText = "Centro Ricerca: " + this.customSearchTarget.name;
          const rBtn = document.getElementById('home-reset-target');
          if(rBtn) rBtn.style.display = 'block';
          this.initMap(this.customSearchTarget.lat, this.customSearchTarget.lng, true);
          this.loadMapMarkers();
      }
    } else {
      this.currentView = view;
      this.updateNavState(view);
      await this.renderList(view);
    }
  }

  goBack() {
    if (this.currentView.includes('-add')) {
      const parentView = this.currentView.split('-')[0];
      this.navigate(parentView);
    } else {
      this.navigate('home');
    }
  }

  // --- Views ---

  // 1. Home View
  async renderHome() {
    const tmpl = document.getElementById('tmpl-home').content.cloneNode(true);
    document.getElementById('app-content').appendChild(tmpl);
    
    await this.initLocationAndMap();
  }

  async initLocationAndMap() {
    const locText = document.getElementById('current-address');
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          this.currentLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          locText.innerText = `Calcolo indirizzo in corso...`;
          
          try {
             const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${this.currentLocation.lat}&lon=${this.currentLocation.lng}`);
             const data = await res.json();
             if (data && data.display_name) {
                 // Estrai la parte più importante dell'indirizzo (es: Via, Città)
                 let addressParts = [];
                 if(data.address.road) addressParts.push(data.address.road);
                 if(data.address.house_number) addressParts.push(data.address.house_number);
                 if(data.address.city || data.address.town || data.address.village) addressParts.push(data.address.city || data.address.town || data.address.village);
                 
                 locText.innerText = addressParts.length > 0 ? addressParts.join(', ') : data.display_name.split(',').slice(0,2).join(', ');
             } else {
                 locText.innerText = `${this.currentLocation.lat.toFixed(4)}, ${this.currentLocation.lng.toFixed(4)}`;
             }
          } catch(e) {
             console.error("Reverse geocoding err", e);
             locText.innerText = `${this.currentLocation.lat.toFixed(4)}, ${this.currentLocation.lng.toFixed(4)}`;
          }
          if (!this.customSearchTarget) {
              this.initMap(this.currentLocation.lat, this.currentLocation.lng);
          } else {
              this.initMap(this.customSearchTarget.lat, this.customSearchTarget.lng, true);
          }
          this.loadMapMarkers();
        },
        (error) => {
          console.error(error);
          locText.innerText = "GPS Offline. Posizione di Default (Roma).";
          if (!this.customSearchTarget) {
             this.initMap(41.9028, 12.4964);
          } else {
             this.initMap(this.customSearchTarget.lat, this.customSearchTarget.lng, true);
          }
          this.loadMapMarkers();
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      locText.innerText = "Geolocalizzazione non supportata";
      this.currentLocation = { lat: 41.9028, lng: 12.4964 };
      this.initMap(41.9028, 12.4964);
      this.loadMapMarkers();
    }
  }

  initMap(lat, lng, isCustomTarget = false) {
    if (this.map) {
      this.map.off();
      this.map.remove();
    }

    const mapEl = document.getElementById('main-map');
    
    // Apply dark mode filter if needed
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if(isDark) mapEl.style.filter = "invert(90%) hue-rotate(180deg)";
    else mapEl.style.filter = "none";

    this.map = L.map('main-map').setView([lat, lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(this.map);

    // Current position marker
    let markerColor = isCustomTarget ? '#d9534f' : '#D4AF37';
    let popupText = isCustomTarget ? "<b>Centro Ricerca</b>" : "<b>La tua posizione</b>";
    L.circleMarker([lat, lng], {
      color: markerColor,
      fillColor: isCustomTarget ? '#c9302c' : '#003366',
      fillOpacity: 1,
      radius: 8
    }).addTo(this.map).bindPopup(popupText).openPopup();
  }

  async loadMapMarkers() {
    if (!this.map) return;
    
    const types = ['work', 'hotels', 'restaurants'];
    const icons = { 
        work: '💼', 
        hotels: '🏨', 
        restaurants: '🍽️' 
    };
    
    for (const t of types) {
      const places = await DB.getPlaces(t);
      places.forEach(p => {
        if (p.lat && p.lng) {
            
          const markerHtml = `
            <div style="font-size: 24px; text-shadow: 0 2px 4px rgba(0,0,0,0.5); transform: translate(-50%, -100%);">
              ${icons[t]}
            </div>`;
            
          const customIcon = L.divIcon({ html: markerHtml, className: 'custom-emoji-icon', iconSize: [0,0]});
            
          const marker = L.marker([p.lat, p.lng], {icon: customIcon}).addTo(this.map);
          let daddr = (p.lat && p.lng && !isNaN(p.lat)) ? `${p.lat},${p.lng}` : encodeURIComponent(p.address || p.name);
          
          marker.bindPopup(`
            <div style="text-align:center;">
              <b style="font-size:1.1rem; color:var(--color-primary);">${p.name}</b><br>
              <span style="color:gray; font-size: 0.9rem;">${p.address || ''}</span><br>
              ${p.phone ? `<a class="btn btn-accent btn-block" href="tel:${p.phone}" style="margin-top:10px; font-size:0.9rem; margin-bottom: 5px;">📞 Chiama</a>` : ''}
              <a class="btn btn-primary btn-block" href="https://www.google.com/maps/dir/?api=1&destination=${daddr}" target="_blank" style="margin-top:5px; font-size:0.9rem;">
                📍 Naviga
              </a>
            </div>
          `);
        }
      });
    }
    this.renderNearbyList();
  }

  async searchCustomTarget(cityOrName) {
     const titleEl = document.getElementById('home-target-title');
     if(titleEl) titleEl.innerText = "Ricerca in corso...";
     try {
         const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityOrName)}&format=json&limit=1`);
         const data = await res.json();
         if(data && data.length > 0) {
             this.customSearchTarget = {
                 lat: parseFloat(data[0].lat),
                 lng: parseFloat(data[0].lon),
                 name: data[0].display_name.split(',')[0]
             };
             if(titleEl) titleEl.innerText = "Centro spostato a: " + this.customSearchTarget.name;
             const rBtn = document.getElementById('home-reset-target');
             if(rBtn) rBtn.style.display = 'block';
             this.initMap(this.customSearchTarget.lat, this.customSearchTarget.lng, true);
             this.loadMapMarkers();
         } else {
             if(titleEl) titleEl.innerText = "Nessun risultato trovato.";
         }
     } catch(e) {
         if(titleEl) titleEl.innerText = "Errore di rete.";
     }
  }

  resetTargetToCurrent() {
      this.customSearchTarget = null;
      const titleEl = document.getElementById('home-target-title');
      if (titleEl) titleEl.innerText = "";
      const searchIn = document.getElementById('home-target-search');
      if (searchIn) searchIn.value = '';
      const rBtn = document.getElementById('home-reset-target');
      if (rBtn) rBtn.style.display = 'none';
      if (this.currentLocation) {
          this.initMap(this.currentLocation.lat, this.currentLocation.lng);
      }
      this.loadMapMarkers();
  }

  setCustomTargetAndGoHome(lat, lng, name) {
     this.customSearchTarget = { lat, lng, name };
     this.navigate('home');
  }

  async renderNearbyList() {
      const target = this.customSearchTarget || this.currentLocation;
      if(!target || !target.lat || !target.lng) return;
      
      const resContainer = document.getElementById('home-nearby-results');
      const listContainer = document.getElementById('nearby-list');
      if(!resContainer || !listContainer) return;
      
      resContainer.style.display = 'block';
      listContainer.innerHTML = '';
      
      let hotels = await DB.getPlaces('hotels');
      let rests = await DB.getPlaces('restaurants');
      
      const calcDist = (place) => {
          if(place.lat && place.lng) {
             place._dist = parseFloat(getDistance(target.lat, target.lng, place.lat, place.lng));
          } else {
             place._dist = Infinity;
          }
          return place;
      };

      hotels = hotels.map(calcDist).filter(p => p._dist !== Infinity).sort((a,b) => a._dist - b._dist);
      rests = rests.map(calcDist).filter(p => p._dist !== Infinity).sort((a,b) => a._dist - b._dist);

      const buildHtml = (places, icon, title) => {
          if(places.length === 0) return '';
          let html = `<h4 style="margin-top:15px; margin-bottom:10px; color:var(--text-main); font-size:1.1rem;">${icon}  ${title} Più Vicini</h4>`;
          places.forEach(p => {
              let daddr = (p.lat && p.lng && !isNaN(p.lat)) ? `${p.lat},${p.lng}` : encodeURIComponent(p.address || p.name);
              let navHtml = `<a class="btn btn-primary" href="https://www.google.com/maps/dir/?api=1&destination=${daddr}" target="_blank" title="Naviga" style="padding:10px;">📍 Naviga</a>`;
              let callHtml = p.phone ? `<a class="btn btn-accent" href="tel:${p.phone}" title="Chiama" style="padding:10px;">📞</a>` : '';
              
              html += `
                  <div class="list-item">
                      <div class="list-item-title" style="display:flex; align-items:center; margin-bottom:5px;">
                         ${p.name} 
                         <span style="color:var(--color-primary); font-weight:bold; font-size:0.85rem; margin-left:auto;">🚗 ~${p._dist} km</span>
                      </div>
                      <div class="list-item-addr">${p.address || ''}</div>
                      <div class="list-item-actions" style="margin-top:10px; flex-direction:row; justify-content: flex-start; gap:10px;">
                         ${navHtml} ${callHtml}
                      </div>
                  </div>
              `;
          });
          return html;
      };

      listContainer.innerHTML = buildHtml(hotels, '🏨', 'Hotel') + buildHtml(rests, '🍽️', 'Ristoranti');
      if (listContainer.innerHTML === '') {
          listContainer.innerHTML = '<div class="empty-state">Nessuna struttura trovata con coordinate GPS valide. Usa il tasto 📍 per l\'indirizzo quando le crei!</div>';
      }
  }

  // 2. List View (Work, Hotels, Restaurants)
  async renderList(type) {
    const tmpl = document.getElementById('tmpl-list').content.cloneNode(true);
    document.getElementById('app-content').appendChild(tmpl);
    
    document.getElementById('list-title').innerText = this.placeTypes[type];
    document.getElementById('add-new-btn').onclick = () => this.navigate(type, 'add');

    const container = document.getElementById('list-container');
    const places = await DB.getPlaces(type);

    if (places.length === 0) {
      container.innerHTML = `<div class="empty-state">Nessun luogo salvato. Aggiungine uno!</div>`;
      return;
    }

    places.forEach(p => {
      const el = document.createElement('div');
      el.className = 'list-item';
      
      let ratingHtml = '';
      if ((type === 'restaurants' || type === 'hotels') && p.rating) {
        ratingHtml = `<div style="color:var(--color-accent); font-size:1.2rem;">${'★'.repeat(p.rating)}${'☆'.repeat(5-p.rating)}</div>`;
      }

      el.dataset.search = `${p.name} ${p.address} ${p.notes || ''}`.toLowerCase();
      
      let amenitiesHtml = '';
      if (type === 'hotels' && p.amenities) {
         let ams = [];
         if(p.amenities.dinner) ams.push('🍽️ Cena');
         if(p.amenities.elevator) ams.push('🛗 Ascensore');
         if(p.amenities.pool) ams.push('🏊 Piscina');
         if(p.amenities.gym) ams.push('🏋️ Palestra');
         if(p.amenities.bar) ams.push('🍸 Bar');
         if(p.amenities.parking) ams.push('🅿️ Parcheggio');
         if(ams.length > 0) {
            amenitiesHtml = `<div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:5px; font-size:0.8rem; color:var(--text-muted);">` + ams.map(a => `<span style="background:var(--bg-color); padding:2px 8px; border-radius:12px; border:1px solid var(--border-color);">${a}</span>`).join('') + `</div>`;
            el.dataset.search += ` ${ams.join(' ')}`.toLowerCase();
         }
      }

      let daddr = (p.lat && p.lng && !isNaN(p.lat)) ? `${p.lat},${p.lng}` : encodeURIComponent(p.address || p.name);
      let navHtml = `<a class="btn btn-primary" href="https://www.google.com/maps/dir/?api=1&destination=${daddr}" target="_blank" title="Naviga">📍</a>`;
      let callHtml = p.phone ? `<a class="btn btn-accent" href="tel:${p.phone}" title="Chiama">📞</a>` : '';
      
      let distanceTarget = this.customSearchTarget || this.currentLocation;
      let distanceHtml = '';
      if(distanceTarget && p.lat && p.lng) {
          const dist = getDistance(distanceTarget.lat, distanceTarget.lng, p.lat, p.lng);
          if(dist) distanceHtml = `<span style="color:var(--color-primary); font-weight:bold; font-size:0.85rem; margin-left:8px; border:1px solid var(--color-primary); padding:2px 6px; border-radius:12px;">🚗 ~${dist} km</span>`;
      }
      
      let findNearbyHtml = '';
      if(type === 'work' && p.lat && p.lng) {
         findNearbyHtml = `<button class="btn btn-icon find-nearby-btn" data-id="${p.id}" style="color:var(--color-accent); border-color:var(--color-accent);" title="Trova Vicinanze">🔎</button>`;
      }

      el.innerHTML = `
        <div class="list-item-title" style="display:flex; align-items:center;">${p.name} ${ratingHtml} ${distanceHtml}</div>
        <div class="list-item-addr">${p.address || 'Posizione GPS'}${p.phone ? ` <br><span style="color:var(--text-main);">📞 ${p.phone}</span>` : ''}</div>
        ${amenitiesHtml}
        ${p.notes ? ` <div style="font-size:0.8rem; color:var(--text-muted); margin-top:8px;">${p.notes}</div>` : ''}
        
        <div class="list-item-actions">
          ${navHtml}
          ${callHtml}
          ${findNearbyHtml}
          <button class="btn btn-icon share-btn" data-id="${p.id}" style="color:#25D366; border-color:#25D366;" title="Condividi">📤</button>
          <button class="btn btn-icon edit-btn" data-id="${p.id}" style="color:var(--color-primary);" title="Modifica">✏️</button>
          <button class="btn btn-icon delete-btn" data-id="${p.id}" style="color:#d9534f; border-color:#d9534f;" title="Elimina">🗑️</button>
        </div>
      `;
      
      el.querySelector('.share-btn').onclick = async () => {
         const textContent = `📍 ${p.name}\nIndirizzo: ${p.address || ''}\n${p.phone ? `Tel: ${p.phone}\n` : ''}Naviga: https://www.google.com/maps/dir/?api=1&destination=${daddr}`;
         if (navigator.share) {
             try { await navigator.share({ title: p.name, text: textContent }); }
             catch(err) { console.error(err); }
         } else {
             // Fallback per Desktop/incompatibilità
             window.open(`https://wa.me/?text=${encodeURIComponent(textContent)}`, '_blank');
         }
      };
      
      if(type === 'work' && p.lat && p.lng) {
          el.querySelector('.find-nearby-btn').onclick = () => {
              this.setCustomTargetAndGoHome(p.lat, p.lng, p.name);
          };
      }

      el.querySelector('.edit-btn').onclick = () => {
         this.navigate(type, 'edit', p);
      };

      el.querySelector('.delete-btn').onclick = async () => {
        if (confirm("Sei sicuro di voler eliminare questo luogo?")) {
           await DB.deletePlace(type, p.id);
           window.showToast("Luogo eliminato.");
           this.renderList(type); // Re-render
        }
      };

      container.appendChild(el);
    });

    // Search Feature
    const searchInput = document.getElementById('list-search');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            Array.from(container.children).forEach(child => {
                if(child.classList.contains('empty-state')) return;
                child.style.display = child.dataset.search.includes(term) ? 'block' : 'none';
            });
        });
    }
  }

  // 3. Add Form View
  async renderForm(type, editData = null) {
    const tmpl = document.getElementById('tmpl-form').content.cloneNode(true);
    document.getElementById('app-content').appendChild(tmpl);
    
    document.getElementById('form-title').innerText = editData ? `Modifica ${this.placeTypes[type].split(' ')[0]}` : `Aggiungi ${this.placeTypes[type].split(' ')[0]}`;
    document.getElementById('place-type').value = type;

    if (type === 'restaurants' || type === 'hotels') {
      document.getElementById('rating-group').style.display = 'block';
    }
    const amGroup = document.getElementById('amenities-group');
    if (amGroup) {
        amGroup.style.display = (type === 'hotels') ? 'block' : 'none';
        if (type === 'hotels') {
            document.getElementById('am_dinner').checked = editData && editData.amenities && editData.amenities.dinner || false;
            document.getElementById('am_elevator').checked = editData && editData.amenities && editData.amenities.elevator || false;
            document.getElementById('am_pool').checked = editData && editData.amenities && editData.amenities.pool || false;
            document.getElementById('am_gym').checked = editData && editData.amenities && editData.amenities.gym || false;
            document.getElementById('am_bar').checked = editData && editData.amenities && editData.amenities.bar || false;
            document.getElementById('am_parking').checked = editData && editData.amenities && editData.amenities.parking || false;
        }
    }
    
    if (editData) {
       document.getElementById('place-id').value = editData.id;
       document.getElementById('place-name').value = editData.name;
       document.getElementById('place-address').value = editData.address || '';
       document.getElementById('place-phone').value = editData.phone || '';
       document.getElementById('place-notes').value = editData.notes || '';
       if(editData.lat !== null) document.getElementById('place-lat').value = editData.lat;
       if(editData.lng !== null) document.getElementById('place-lng').value = editData.lng;
       
       if (editData.rating && (type === 'restaurants' || type === 'hotels')) {
          const rEl = document.querySelector(`input[name="rating"][value="${editData.rating}"]`);
          if(rEl) rEl.checked = true;
       }
    }

    // GPS Button Logic
    document.getElementById('get-gps-btn').addEventListener('click', () => {
      if (!navigator.geolocation) return alert("Geolocalizzazione non supportata");
      
      const btn = document.getElementById('get-gps-btn');
      btn.innerText = "⏳";
      
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          document.getElementById('place-lat').value = pos.coords.latitude;
          document.getElementById('place-lng').value = pos.coords.longitude;
          document.getElementById('place-address').value = `[GPS]: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
          btn.innerText = "✅";
        },
        (err) => {
          alert('Impossibile ottenere la posizione.');
          btn.innerText = "📍";
        },
        { enableHighAccuracy: true }
      );
    });
    
    // Auto-fill from URL Logic (Ultimate Robust Version)
    document.getElementById('fetch-data-btn').addEventListener('click', async () => {
        const urlInput = document.getElementById('place-website-url').value.trim();
        if (!urlInput) return window.showToast("Inserisci un link prima!", true);
        
        // Assicurati che l'URL inizi con http/https
        let url = urlInput;
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

        const btn = document.getElementById('fetch-data-btn');
        const originalText = btn.innerText;
        btn.innerText = "⏳ Analisi...";
        btn.disabled = true;
        
        const proxies = [
            (u) => `https://api.corsproxy.io/?url=${encodeURIComponent(u)}`,
            (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
            (u) => `https://api.codetabs.com/v1/proxy?url=${encodeURIComponent(u)}`
        ];

        let htmlContent = null;
        let attempt = 0;

        for (const getProxyUrl of proxies) {
            try {
                attempt++;
                if(attempt > 1) {
                    btn.innerText = `🔄 Provando #${attempt}...`;
                    console.log(`[Proxy] Tentativo #${attempt} con ${getProxyUrl(url)}`);
                }
                
                const response = await fetch(getProxyUrl(url));
                if (!response.ok) throw new Error("Proxy error");
                
                const data = await response.json();
                // Gestione diversi formati di risposta dei proxy
                htmlContent = data.contents || data.result || (typeof data === 'string' ? data : null); 
                
                if (htmlContent && typeof htmlContent === 'string' && htmlContent.length > 200) {
                    console.log(`[Proxy] Successo al tentativo #${attempt}`);
                    break; 
                }
            } catch (e) {
                console.warn(`[Proxy] Tentativo ${attempt} fallito.`);
            }
        }

        if (!htmlContent) {
            btn.innerText = originalText;
            btn.disabled = false;
            return window.showToast("Il sito blocca l'accesso automatico. Prova a inserire i dati a mano.", true);
        }

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, 'text/html');
            
            // --- 1. ESTRAZIONE NOME ---
            let name = "";
            const nameSelectors = [
                'meta[property="og:site_name"]',
                'meta[property="og:title"]',
                'meta[name="application-name"]',
                'title',
                '.logo-text', '.site-title', 'h1', 'h2'
            ];

            for (const sel of nameSelectors) {
                const el = doc.querySelector(sel);
                if (!el) continue;
                
                let val = sel.includes('meta') ? el.getAttribute('content') : el.innerText;
                if (!val || val.length < 3) continue;

                // Evita titoli generici
                const low = val.toLowerCase();
                if (low === 'home' || low === 'homepage' || low === 'home page' || low === 'benvenuti' || low === 'index') continue;
                
                name = val;
                break;
            }
            
            // Fallback: cerca nel copyright in fondo
            if (!name || name.length < 3) {
                const footerText = doc.body.innerText.split('\n').slice(-20).join(' '); // Ultimi pezzi
                const cpMatch = footerText.match(/(?:Copyright|©)\s*(?:\d{4})?\s*([^,|.]+)/i);
                if (cpMatch) name = cpMatch[1].trim();
            }

            if (name) {
                name = name.split('|')[0].split('-')[0].split(' – ')[0].split(' : ')[0].trim();
                document.getElementById('place-name').value = name;
            }

            // --- 2. ESTRAZIONE TELEFONO ---
            let phone = "";
            const telLink = doc.querySelector('a[href^="tel:"]');
            if (telLink) {
                phone = telLink.getAttribute('href').replace('tel:', '').replace(/\s+/g, '').trim();
            } else {
                const phoneRegex = /(?:(?:\+39|0039)\s?)?((?:0|3)\d{1,4}\s?[\d\s-]{5,10})/g;
                const matches = htmlContent.match(phoneRegex);
                if (matches) phone = matches[0].replace(/\s+/g, '').trim();
            }
            if (phone) document.getElementById('place-phone').value = phone;

            // --- 3. ESTRAZIONE INDIRIZZO ---
            let address = "";
            // Cerca zone sospette
            const addrSearchArea = doc.querySelector('address, footer, .footer, #footer, .contact, #contact') || doc.body;
            const text = addrSearchArea.innerText.replace(/\s+/g, ' ');

            // Regex avanzata per indirizzi italiani (comprende vari formati anche con comuni/CAP invertiti)
            const itAddrRegex = /(?:Via|Piazza|Viale|Corso|Largo|Vicolo|Contrada|Loc\.|Località)\s+[A-Z][a-z\s']+,?\s+\d{1,4}?[^,]*?,\s*(?:\d{5}\s+[A-Z\s]+|[A-Z\s]+\s+\d{5})(?:\s*\([A-Z]{2}\))?/i;
            const match = text.match(itAddrRegex);
            
            if (match) {
                address = match[0].trim();
            } else if (doc.querySelector('address')) {
                address = doc.querySelector('address').innerText.trim().replace(/\s+/g, ' ');
            }
            
            if (address) document.getElementById('place-address').value = address;

            window.showToast("Dati recuperati! Controlla i campi.");
        } catch (err) {
            console.error(err);
            window.showToast("Errore durante l'analisi del sito.", true);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    });

    // Form Submit logic...

    document.getElementById('place-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const originalBtnText = submitBtn.innerText;
      submitBtn.disabled = true;
      submitBtn.innerText = "Salvataggio...";

      try {
        let lat = document.getElementById('place-lat').value;
        let lng = document.getElementById('place-lng').value;
        let address = document.getElementById('place-address').value;
        
        // Geocodifica al volo usando OpenStreetMap se è stato digitato un indirizzo testo ma non si è usato il GPS (📍)
        if((!lat || !lng) && address.trim().length > 0) {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
                const geodata = await res.json();
                if (geodata && geodata.length > 0) {
                    lat = geodata[0].lat;
                    lng = geodata[0].lon;
                }
            } catch(e) { console.error("Geocoding failed", e); }
        }

        // Se non si ha null'altro e non vi è indirizzo, prova a forzare la posizione attuale
        if(!lat || !lng) {
            if(this.currentLocation && !address.trim()) {
                lat = this.currentLocation.lat;
                lng = this.currentLocation.lng;
            }
        }

        let parsedLat = parseFloat(lat);
        let parsedLng = parseFloat(lng);

        const data = {
          name: document.getElementById('place-name').value,
          address: address,
          phone: document.getElementById('place-phone').value,
          notes: document.getElementById('place-notes').value,
          lat: isNaN(parsedLat) ? null : parsedLat,
          lng: isNaN(parsedLng) ? null : parsedLng,
          createdAt: new Date().toISOString()
        };

        if (type === 'restaurants' || type === 'hotels') {
          const ratingEl = document.querySelector('input[name="rating"]:checked');
          data.rating = ratingEl ? parseInt(ratingEl.value) : 0;
        }
        
        if (type === 'hotels') {
           data.amenities = {
              dinner: document.getElementById('am_dinner').checked,
              elevator: document.getElementById('am_elevator').checked,
              pool: document.getElementById('am_pool').checked,
              gym: document.getElementById('am_gym').checked,
              bar: document.getElementById('am_bar').checked,
              parking: document.getElementById('am_parking').checked
           };
        }

        const placeId = document.getElementById('place-id').value;
        if (placeId) {
            await DB.updatePlace(type, placeId, data);
            window.showToast("Modifiche salvate!");
        } else {
            await DB.addPlace(type, data);
            window.showToast("Nuovo luogo aggiunto!");
        }

        this.navigate(type); // Go back to list
      } catch (err) {
        console.error("Errore durante il salvataggio:", err);
        window.showToast("Errore durante il salvataggio. Controlla la connessione.", true);
        submitBtn.disabled = false;
        submitBtn.innerText = originalBtnText;
      }
    });
  }
}

// Toast Functionality Globale
window.showToast = function(msg, isError = false) {
  let container = document.getElementById('toast-container');
  if(!container) {
     container = document.createElement('div');
     container.id = 'toast-container';
     document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = (isError ? '❌ ' : '✅ ') + msg;
  if(isError) toast.style.borderLeftColor = '#d9534f';
  container.appendChild(toast);
  setTimeout(() => {
     toast.style.animation = 'toastFadeOut 0.3s ease-in forwards';
     setTimeout(() => toast.remove(), 300);
  }, 2500);
};

// Init App
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
