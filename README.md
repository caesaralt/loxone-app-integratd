# Plan2Board – Loxone PDF Analyzer

This small web application lets you upload a floor‑plan PDF, analyses the
text for common room names (kitchen, bedroom, living, etc.), applies a set
of default Loxone devices for each room type and produces:

* A per‑room breakdown of how many switches, dimmer and relay channels,
  blind actuators, presence sensors, leak sensors and temperature sensors are
  required.
* A **bill of materials (BOM)** that totals the devices across the whole
  project.
* A **draft I/O map** that assigns dimmer/relay/blind channels in a simple,
  sequential manner.  The channel names in the draft are placeholders;
  refine them to suit your actual cabinet layout.
* Downloadable CSV files for both the BOM and I/O map.

## Running the app locally

1. Serve the files with any static web server (e.g. `python3 -m http.server`).
2. Navigate your browser to the served `index.html`.
3. Upload a PDF.  The file should contain selectable text; scanned images
   without OCR will not work.
4. Wait for processing to complete.  The results will be displayed on
   the page along with download links for CSV exports.

## Customising room standards

The file `standards.json` defines the default number of devices per room type.
Each key corresponds to a lower‑case room name (e.g. `kitchen`, `bedroom`).
You can edit this file to match your own standards, add new room types or
adjust the quantities of devices.  The app will automatically pick up
changes when you reload the page.

## Publishing on GitHub Pages

To make this tool available online via GitHub Pages:

1. Create a new repository on GitHub.  Name it whatever you like (for
   example `plan2board-web`).
2. Upload **all** files from this folder (`index.html`, `app.js`, `styles.css`,
   `standards.json` and `README.md`) to the root of the repository.
3. In the repository’s **Settings**, locate the **Pages** section.  Choose
   **Deploy from a branch** and select the branch (e.g. `main`) and the
   folder `/` (root) as the source.  Save the settings.  According to
   GitHub’s documentation, this option lets you pick the branch and
   directory that will be served as your site【200226476845186†L50-L54】.
4. If your site does not need Jekyll, create a file named `.nojekyll` at
   the repository root to prevent GitHub Pages from running its default
   Jekyll processing【200226476845186†L71-L74】.
5. After a minute or two, your site will be live at
   `https://YOUR_USERNAME.github.io/REPO_NAME/`.  Test it by visiting that URL
   and uploading a PDF.

## Limitations

* The PDF must contain embedded text.  Scanned plans without text will not
  be parsed.  You can run OCR on such files first.
* Room detection is based on simple pattern matching.  If your plans use
  unusual names or abbreviations, you can add additional regular expressions
  in `app.js`.
* The draft I/O map assigns channels sequentially and does not consider
  cabinet layout or 24 V power calculations.  Use it as a starting point and
  refine for your final design.