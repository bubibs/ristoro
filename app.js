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
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    let isDark = localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && prefersDark);
    
    const applyTheme = () => {
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      toggle.innerHTML = isDark ? '☀️' : '🌙';
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      
      // Update map tile layer if map exists
      if (this.map) {
          // Leaflet doesn't have native dark mode well supported without custom tiles
          // We apply a CSS invert filter to the map tiles via class if dark mode is active
          const mapEl = document.getElementById('main-map');
          if(mapEl) {
               if(isDark) mapEl.style.filter = "invert(90%) hue-rotate(180deg)";
               else mapEl.style.filter = "none";
          }
      }
    };

    toggle.addEventListener('click', () => {
      isDark = !isDark;
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

  async navigate(view, subView = null) {
    const content = document.getElementById('app-content');
    content.innerHTML = ''; // Clear current
    
    // Basic Routing
    if (subView === 'add') {
      this.currentView = `${view}-add`;
      await this.renderForm(view);
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
    const colors = { work: '#FF5733', hotels: '#33A1FF', restaurants: '#FF33A1' };
    
    for (const t of types) {
      const places = await DB.getPlaces(t);
      places.forEach(p => {
        if (p.lat && p.lng) {
            
          const markerHtml = `<div style="background-color: ${colors[t]}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`;
          const customIcon = L.divIcon({ html: markerHtml, className: '', iconSize: [16,16]});
            
          const marker = L.marker([p.lat, p.lng], {icon: customIcon}).addTo(this.map);
          let daddr = (p.lat && p.lng && !isNaN(p.lat)) ? `${p.lat},${p.lng}` : encodeURIComponent(p.address || p.name);
          
          marker.bindPopup(`
            <b>${p.name}</b><br>
            ${p.address || ''}<br>
            <a href="http://maps.apple.com/?daddr=${daddr}" target="_blank" style="display:block; margin-top:5px; color:#003366; font-weight:bold;">📍 Naviga (Apple Maps)</a>
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
      if (type === 'restaurants' && p.rating) {
        ratingHtml = `<div style="color:var(--color-accent); font-size:1.2rem;">${'★'.repeat(p.rating)}${'☆'.repeat(5-p.rating)}</div>`;
      }

      let daddr = (p.lat && p.lng && !isNaN(p.lat)) ? `${p.lat},${p.lng}` : encodeURIComponent(p.address || p.name);
      let navHtml = `<a class="btn btn-primary" href="http://maps.apple.com/?daddr=${daddr}" target="_blank">📍 Naviga</a>`;

      el.innerHTML = `
        <div class="list-item-title">${p.name} ${ratingHtml}</div>
        <div class="list-item-addr">${p.address || 'Posizione GPS'}</div>
        ${p.notes ? ` <div style="font-size:0.8rem; color:var(--text-muted);">${p.notes}</div>` : ''}
        
        <div class="list-item-actions">
          ${navHtml}
          <button class="btn btn-icon delete-btn" data-id="${p.id}" style="color:#d9534f; border-color:#d9534f; flex:none;">Elimina</button>
        </div>
      `;

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
  async renderForm(type) {
    const tmpl = document.getElementById('tmpl-form').content.cloneNode(true);
    document.getElementById('app-content').appendChild(tmpl);
    
    document.getElementById('form-title').innerText = `Aggiungi ${this.placeTypes[type].split(' ')[0]}`;
    document.getElementById('place-type').value = type;

    if (type === 'restaurants') {
      document.getElementById('rating-group').style.display = 'block';
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

      if (type === 'restaurants') {
        const ratingEl = document.querySelector('input[name="rating"]:checked');
        data.rating = ratingEl ? parseInt(ratingEl.value) : 0;
      }

      await DB.addPlace(type, data);
      this.navigate(type); // Go back to list
    });
  }
}

// Init App
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
