// App Logic (Nessun import ES Module, usa variabili globali window.DB per compatibilità locale)
class App {
  constructor() {
    this.currentView = 'home';
    this.currentLocation = null;
    this.map = null;
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
    const locText = document.getElementById('current-location-text');
    
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
          locText.innerText = "Impossibile recuperare posizione";
          // Default location (e.g. Rome/Milan centroid)
          this.initMap(45.4642, 9.1900);
        },
        { enableHighAccuracy: true }
      );
    } else {
      locText.innerText = "Geolocalizzazione non supportata";
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
              <a class="btn btn-primary btn-block" href="http://maps.apple.com/?daddr=${daddr}" target="_blank" style="margin-top:10px; font-size:0.9rem;">
                📍 Naviga su Apple Maps
              </a>
            </div>
          `);
        }
      });
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
      let navHtml = `<a class="btn btn-primary" href="http://maps.apple.com/?daddr=${daddr}" target="_blank">📍 Avvia Navigatore</a>`;

      el.innerHTML = `
        <div class="list-item-title">${p.name} ${ratingHtml}</div>
        <div class="list-item-addr">${p.address || 'Posizione GPS'}</div>
        ${p.notes ? ` <div style="font-size:0.8rem; color:var(--text-muted);">${p.notes}</div>` : ''}
        
        <div class="list-item-actions">
          ${navHtml}
          <button class="btn btn-icon edit-btn" data-id="${p.id}" style="color:var(--color-primary); flex:none;">✏️ Modifica</button>
          <button class="btn btn-icon delete-btn" data-id="${p.id}" style="color:#d9534f; border-color:#d9534f; flex:none;">🗑️ Elimina</button>
        </div>
      `;

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
