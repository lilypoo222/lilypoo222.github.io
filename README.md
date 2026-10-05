# Portfolio

Static portfolio site. No build step: upload the contents of this folder to your web host as-is.

## Structure

```
index.html          Home page (must stay at the root)
assets/
  css/              Stylesheets (style.css is linked from every page)
  js/               Scripts (main.js is linked from every page)
  images/           Photos, project screenshots
  icons/            Favicon and small icons
  fonts/            Self-hosted web fonts
  docs/             Downloadable files (e.g. resume PDF)
```

## Uploading

Upload everything **except** `.git/`, `.gitignore`, `README.md` and `tools/`.

## Local preview

Pages that use WebGL need to be served over `http://` (opening the file directly won't load the artwork into WebGL):

```
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```

Then open http://localhost:8080/.
All links use relative paths, so the site works at a domain root or in a subfolder.
