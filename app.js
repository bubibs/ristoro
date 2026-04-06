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
    await this.navigate('home');
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
          
          this.initMap(this.currentLocation.lat, this.currentLocation.lng);
          this.loadMapMarkers();
        },
        (error) => {
          console.error(error);
          locText.innerText = "GPS Offline. Posizione di Default (Roma).";
          this.currentLocation = { lat: 41.9028, lng: 12.4964 };
          this.initMap(41.9028, 12.4964);
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

  initMap(lat, lng) {
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
    L.circleMarker([lat, lng], {
      color: '#D4AF37',
      fillColor: '#003366',
      fillOpacity: 1,
      radius: 8
    }).addTo(this.map).bindPopup("<b>La tua posizione</b>").openPopup();
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
             this.loadMapMarkers();
         } else {
             if(titleEl) titleEl.innerText = "Nessun risultato trovato.";
         }
     } catch(e) {
         if(titleEl) titleEl.innerText = "Errore di rete.";
     }
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

      el.dataset.search = `${p.name} ${p.address} ${p.notes || ''}`.toLowerCase();

      el.innerHTML = `
        <div class="list-item-title" style="display:flex; align-items:center;">${p.name} ${ratingHtml} ${distanceHtml}</div>
        <div class="list-item-addr">${p.address || 'Posizione GPS'}${p.phone ? ` <br><span style="color:var(--text-main);">📞 ${p.phone}</span>` : ''}</div>
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

    // Form Submit
    document.getElementById('place-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      
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

      const placeId = document.getElementById('place-id').value;
      if (placeId) {
          await DB.updatePlace(type, placeId, data);
      } else {
          await DB.addPlace(type, data);
      }

      this.navigate(type); // Go back to list
    });
  }
}

// Init App
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
