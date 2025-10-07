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

// Handle PDF upload and processing.  This function now performs the same
// analysis as before, but also renders the first page of the PDF onto a
// canvas, overlays device icons near detected room names, and enables
// downloading an annotated PDF.  It maintains the existing results tables.
document.getElementById('pdfFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const loadingEl = document.getElementById('loading');
  const resultsEl = document.getElementById('results');
  const canvasContainer = document.getElementById('canvas-container');
  const downloadBtn = document.getElementById('downloadPdf');
  const canvas = document.getElementById('pdfCanvas');
  const ctx = canvas.getContext('2d');
  // Reset UI
  resultsEl.innerHTML = '';
  canvasContainer.style.display = 'none';
  downloadBtn.style.display = 'none';
  loadingEl.style.display = 'block';
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    // Read all pages for text analysis
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(' ');
      fullText += ' ' + pageText;
    }
    const lowerText = fullText.toLowerCase();
    // Count rooms found across all pages
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
    // Build device summary per room name (enumerated) using the loaded standards
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
    // Summarise BOM counts
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
    // Draft I/O map
    const ioEntries = [];
    let dimmerChannelCounter = 1;
    let relayChannelCounter = 1;
    let blindChannelCounter = 1;
    Object.entries(deviceSummary).forEach(([roomName, defs]) => {
      for (let i = 0; i < defs.touch_switches; i++) {
        ioEntries.push({ room: roomName, device: 'Touch switch', channel: '' });
      }
      for (let i = 0; i < defs.presence_sensors; i++) {
        ioEntries.push({ room: roomName, device: 'Presence sensor', channel: '' });
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
        ioEntries.push({ room: roomName, device: 'Blind actuator', channel: `Blind ${blindChannelCounter}` });
        blindChannelCounter++;
      }
      for (let i = 0; i < defs.leak_sensors; i++) {
        ioEntries.push({ room: roomName, device: 'Leak sensor', channel: '' });
      }
      for (let i = 0; i < defs.temperature_sensors; i++) {
        ioEntries.push({ room: roomName, device: 'Temperature sensor', channel: '' });
      }
    });
    // Render results tables as before
    loadingEl.style.display = 'none';
    const fragment = document.createDocumentFragment();
    // Devices per room table
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

    // Now prepare to render the first page and overlay device icons
    const firstPage = await pdf.getPage(1);
    // Determine a scale to fit the page into a max width of 700px (or the container width)
    const containerWidth = 700;
    const viewport = firstPage.getViewport({ scale: 1 });
    const scale = Math.min(containerWidth / viewport.width, 1.0);
    const scaledViewport = firstPage.getViewport({ scale });
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    // Render the PDF page onto the canvas
    await firstPage.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
    // Extract text with positions for the first page
    const textContent = await firstPage.getTextContent();
    // Collect positions of room names to overlay icons
    const positions = [];
    textContent.items.forEach((item) => {
      const lower = item.str.toLowerCase();
      ROOM_PATTERNS.forEach((regex) => {
        // Always create a fresh regex without global flag for detection
        const re = new RegExp(regex.source, 'i');
        if (re.test(lower)) {
          // Convert PDF coordinates to viewport (canvas) coordinates
          const point = scaledViewport.convertToViewportPoint(item.transform[4], item.transform[5]);
          const roomKey = regex.source.replace(/\\/g, '').replace(/\(.*\)\?/g, '').replace(/gi$/, '');
          positions.push({ roomKey, x: point[0], y: point[1] });
        }
      });
    });
    // Device icon definitions: label, short code and color
    const iconDefs = {
      touch_switches: { label: 'TS', color: '#007bff' },
      presence_sensors: { label: 'PS', color: '#28a745' },
      dimmer_channels: { label: 'DC', color: '#ffc107' },
      relay_channels: { label: 'RC', color: '#fd7e14' },
      blind_actuators: { label: 'BA', color: '#6f42c1' },
      leak_sensors: { label: 'LS', color: '#20c997' },
      temperature_sensors: { label: 'TP', color: '#dc3545' }
    };
    // Helper to draw an icon on the canvas
    function drawIcon(cx, cy, label, color) {
      const radius = 8;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy);
    }
    // Overlay icons for each detected room position
    positions.forEach((pos) => {
      const defs = standards[pos.roomKey];
      if (!defs) return;
      let offsetX = pos.x + 10; // start offset to the right of the room label
      const offsetY = pos.y - 10; // slightly above the baseline
      Object.keys(iconDefs).forEach((key) => {
        const count = defs[key];
        if (count && count > 0) {
          const { label, color } = iconDefs[key];
          for (let i = 0; i < count; i++) {
            drawIcon(offsetX, offsetY, label, color);
            offsetX += 18; // spacing between icons
          }
        }
      });
    });
    // Show canvas and download button
    canvasContainer.style.display = 'block';
    downloadBtn.style.display = 'inline-block';
    // Download button handler
    downloadBtn.onclick = () => {
      // Use jsPDF to export the canvas as a PDF
      const imgData = canvas.toDataURL('image/png');
      const { jsPDF } = window.jspdf;
      const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
      const pdfDoc = new jsPDF({
        orientation,
        unit: 'pt',
        format: [canvas.width, canvas.height]
      });
      pdfDoc.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdfDoc.save('annotated_plan.pdf');
    };
  } catch (err) {
    loadingEl.style.display = 'none';
    resultsEl.innerHTML = `<p style="color:red;">Error processing PDF: ${err.message}</p>`;
  }
});