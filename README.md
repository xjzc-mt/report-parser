# report-parser

A local Vite + React app for:

- extracting ESG indicators from PDF reports with Gemini
- compressing a PDF inside the browser

## Features

- **工作台 / Extraction**
  - upload one or more PDFs
  - upload one Excel / CSV requirements file
  - run extraction sequentially
  - export results to Excel
- **PDF压缩 / PDF Compressor**
  - upload one PDF
  - compress it in the browser
  - download the compressed file

## Prerequisites

- Git
- Node.js
- npm
- a Gemini API key

> Recommended: use a recent Node.js LTS version.

## 1. Clone the project

```bash
git clone git@github.com:fangyishu/report-parser.git
cd report-parser
```

If you prefer HTTPS:

```bash
git clone https://github.com/fangyishu/report-parser.git
cd report-parser
```

## 2. Install dependencies

```bash
npm install
```

This installs all required packages, including:

- React
- Vite
- Mantine
- Tabler Icons
- xlsx
- pdf-lib
- pako

## 3. Configure the API key

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Then put your Gemini API key into `.env`:

```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

### Notes

- The app currently reads the API key from `.env`
- `.env` is ignored by Git
- The extraction UI no longer exposes API endpoint / API key settings

## 4. Start the project

```bash
npm run dev
```

Vite will print a local URL, usually something like:

```bash
http://localhost:5173
```

Open that URL in your browser.

## 5. Build for production

```bash
npm run build
```

## 6. Preview the production build

```bash
npm run preview
```

## How to use

### Extraction

1. Open **工作台**
2. Upload:
   - one or more PDF files
   - one Excel / CSV requirements file
3. Confirm your `.env` contains `VITE_GEMINI_API_KEY`
4. Click **Start Extraction**
5. Review results in the table
6. Click **Export to Excel**

### Requirements file format

Your Excel / CSV should include columns like:

- `indicator_code`
- `indicator_name`
- `value_type`
- `definition`
- `guidance`
- `prompt`

Supported `value_type` values:

- `文字型`
- `数值型`
- `货币型`
- `强度型`

### PDF Compressor

1. Open **PDF压缩**
2. Upload one PDF
3. Click **Start Compression**
4. Wait for completion
5. Click the large download button

## Project structure

```text
src/
  components/
  constants/
  content/
  services/
  styles/
  utils/
```

## Troubleshooting

### `npm install` fails

Try:

```bash
rm -rf node_modules package-lock.json
npm install
```

### App starts but extraction cannot run

Check:

- `.env` exists
- `VITE_GEMINI_API_KEY` is set correctly
- you restarted `npm run dev` after changing `.env`

### PDF upload is rejected

Make sure the file is a real `.pdf`.

## License

ISC
