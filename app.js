// Plan2Board – client‑side script to parse a PDF and apply Loxone room standards.

// Load the standards definitions once at startup
let standards = {};
fetch('standards.json')
  .then((r) => r.json())
  .then((json) => {
    standards = json;
  })
  .catch((err) => console.error('Failed to load standards', err));

// Configure PDF.js worker; using a CDN here
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

// Define a few common room names to search for.  Extend this as needed.
const ROOM_PATTERNS = [
  /kitchen/gi,
  /living/gi,
  /bedroom/gi,
  /bath(room)?/gi,
  /dining/gi,
  /office/gi,
  /laundry/gi,
  /hallway/gi
];

// Utility to create and download a CSV file in the browser
function downloadCSV(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Handle PDF upload
document.getElementById('pdfFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const loadingEl = document.getElementById('loading');
  const resultsEl = document.getElementById('results');
  resultsEl.innerHTML = '';
  loadingEl.style.display = 'block';
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      // Concatenate all text items
      const pageText = textContent.items.map((item) => item.str).join(' ');
      fullText += ' ' + pageText;
    }
    // Lowercase the entire text for easier matching
    const lowerText = fullText.toLowerCase();
    // Count rooms found
    const roomCounts = {};
    ROOM_PATTERNS.forEach((regex) => {
      const name = regex.source.replace(/\\/g, '').replace(/\(.*\)\?/g, '').replace(/gi$/, '');
      roomCounts[name] = 0;
      let match;
      const re = new RegExp(regex.source, 'gi');
      while ((match = re.exec(lowerText)) !== null) {
        roomCounts[name]++;
      }
    });
    // Build device list per room
    const deviceSummary = {};
    Object.keys(roomCounts).forEach((roomKey) => {
      const count = roomCounts[roomKey];
      if (count > 0 && standards[roomKey]) {
        for (let i = 0; i < count; i++) {
          const roomName = `${roomKey.charAt(0).toUpperCase() + roomKey.slice(1)} ${
            count > 1 ? i + 1 : ''
          }`.trim();
          deviceSummary[roomName] = standards[roomKey];
        }
      }
    });
    // Create BOM summary
    const bomTotals = {
      touch_switches: 0,
      presence_sensors: 0,
      dimmer_channels: 0,
      relay_channels: 0,
      blind_actuators: 0,
      leak_sensors: 0,
      temperature_sensors: 0
    };
    Object.values(deviceSummary).forEach((defs) => {
      Object.keys(bomTotals).forEach((k) => {
        bomTotals[k] += defs[k] || 0;
      });
    });
    // Build I/O mapping (draft).  This simply enumerates devices sequentially.
    const ioEntries = [];
    let dimmerChannelCounter = 1;
    let relayChannelCounter = 1;
    let blindChannelCounter = 1;
    Object.entries(deviceSummary).forEach(([roomName, defs]) => {
      // switches don't occupy channels in typical Loxone, but we list them
      for (let i = 0; i < defs.touch_switches; i++) {
        ioEntries.push({
          room: roomName,
          device: 'Touch switch',
          channel: ''
        });
      }
      for (let i = 0; i < defs.presence_sensors; i++) {
        ioEntries.push({
          room: roomName,
          device: 'Presence sensor',
          channel: ''
        });
      }
      for (let i = 0; i < defs.dimmer_channels; i++) {
        ioEntries.push({
          room: roomName,
          device: 'Dimmer channel',
          channel: `Dimmer ${Math.ceil(dimmerChannelCounter / 4)} ch${((dimmerChannelCounter - 1) % 4) + 1}`
        });
        dimmerChannelCounter++;
      }
      for (let i = 0; i < defs.relay_channels; i++) {
        ioEntries.push({
          room: roomName,
          device: 'Relay channel',
          channel: `Relay ${Math.ceil(relayChannelCounter / 16)} ch${((relayChannelCounter - 1) % 16) + 1}`
        });
        relayChannelCounter++;
      }
      for (let i = 0; i < defs.blind_actuators; i++) {
        ioEntries.push({
          room: roomName,
          device: 'Blind actuator',
          channel: `Blind ${blindChannelCounter}`
        });
        blindChannelCounter++;
      }
      for (let i = 0; i < defs.leak_sensors; i++) {
        ioEntries.push({
          room: roomName,
          device: 'Leak sensor',
          channel: ''
        });
      }
      for (let i = 0; i < defs.temperature_sensors; i++) {
        ioEntries.push({
          room: roomName,
          device: 'Temperature sensor',
          channel: ''
        });
      }
    });
    // Render results
    loadingEl.style.display = 'none';
    const fragment = document.createDocumentFragment();
    const deviceTable = document.createElement('table');
    deviceTable.innerHTML = '<caption>Devices per room</caption><thead><tr><th>Room</th><th>Device</th><th>Count</th></tr></thead><tbody></tbody>';
    const tbody = deviceTable.querySelector('tbody');
    Object.entries(deviceSummary).forEach(([roomName, defs]) => {
      Object.keys(defs).forEach((k) => {
        const label = k
          .replace('touch_switches', 'Touch switches')
          .replace('presence_sensors', 'Presence sensors')
          .replace('dimmer_channels', 'Dimmer channels')
          .replace('relay_channels', 'Relay channels')
          .replace('blind_actuators', 'Blind actuators')
          .replace('leak_sensors', 'Leak sensors')
          .replace('temperature_sensors', 'Temperature sensors');
        const row = document.createElement('tr');
        row.innerHTML = `<td>${roomName}</td><td>${label}</td><td>${defs[k]}</td>`;
        tbody.appendChild(row);
      });
    });
    fragment.appendChild(deviceTable);
    // BOM table
    const bomTable = document.createElement('table');
    bomTable.innerHTML = '<caption>Bill of materials (total devices)</caption><thead><tr><th>Device</th><th>Quantity</th></tr></thead><tbody></tbody>';
    const bomBody = bomTable.querySelector('tbody');
    Object.keys(bomTotals).forEach((k) => {
      const label = k
        .replace('touch_switches', 'Touch switches')
        .replace('presence_sensors', 'Presence sensors')
        .replace('dimmer_channels', 'Dimmer channels')
        .replace('relay_channels', 'Relay channels')
        .replace('blind_actuators', 'Blind actuators')
        .replace('leak_sensors', 'Leak sensors')
        .replace('temperature_sensors', 'Temperature sensors');
      const row = document.createElement('tr');
      row.innerHTML = `<td>${label}</td><td>${bomTotals[k]}</td>`;
      bomBody.appendChild(row);
    });
    fragment.appendChild(bomTable);
    // I/O map table
    const ioTable = document.createElement('table');
    ioTable.innerHTML = '<caption>Draft I/O map</caption><thead><tr><th>Room</th><th>Device</th><th>Assigned channel</th></tr></thead><tbody></tbody>';
    const ioBody = ioTable.querySelector('tbody');
    ioEntries.forEach((entry) => {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${entry.room}</td><td>${entry.device}</td><td>${entry.channel}</td>`;
      ioBody.appendChild(row);
    });
    fragment.appendChild(ioTable);
    // CSV download links
    const bomCsv = ['Device,Quantity'];
    Object.keys(bomTotals).forEach((k) => {
      const label = k
        .replace('touch_switches', 'Touch switches')
        .replace('presence_sensors', 'Presence sensors')
        .replace('dimmer_channels', 'Dimmer channels')
        .replace('relay_channels', 'Relay channels')
        .replace('blind_actuators', 'Blind actuators')
        .replace('leak_sensors', 'Leak sensors')
        .replace('temperature_sensors', 'Temperature sensors');
      bomCsv.push(`${label},${bomTotals[k]}`);
    });
    const ioCsv = ['Room,Device,Channel'];
    ioEntries.forEach((e) => {
      ioCsv.push(`${e.room},${e.device},${e.channel}`);
    });
    const bomLink = document.createElement('a');
    bomLink.href = '#';
    bomLink.className = 'download-link';
    bomLink.textContent = 'Download BOM CSV';
    bomLink.addEventListener('click', (evt) => {
      evt.preventDefault();
      downloadCSV('bom.csv', bomCsv.join('\n'));
    });
    const ioLink = document.createElement('a');
    ioLink.href = '#';
    ioLink.className = 'download-link';
    ioLink.textContent = 'Download I/O CSV';
    ioLink.addEventListener('click', (evt) => {
      evt.preventDefault();
      downloadCSV('io_map.csv', ioCsv.join('\n'));
    });
    const linksDiv = document.createElement('div');
    linksDiv.appendChild(bomLink);
    linksDiv.appendChild(ioLink);
    fragment.appendChild(linksDiv);
    resultsEl.appendChild(fragment);
  } catch (err) {
    loadingEl.style.display = 'none';
    resultsEl.innerHTML = `<p style="color:red;">Error processing PDF: ${err.message}</p>`;
  }
});